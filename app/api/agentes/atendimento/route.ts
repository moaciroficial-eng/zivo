import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { carregarConhecimento } from '@/lib/conhecimento'
import { executarTurnoTarefa } from '@/lib/agentes/tarefa-executor'

/* Modo tarefa pode esperar trava + debounce (~30s no pior caso) */
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HORARIO_PADRAO  = 'Manhã: 9h às 12h | Tarde: 14h às 19h'
const ENDERECO_PADRAO = 'Roda Velha, Bahia — Av. Paraná, ao lado do Iphome Burguer'

type TamanhoItem = { tamanho: string; qtd: number }
type EstoqueItem = {
  id: string; nome: string; marca: string
  cor: string | null; tamanhos: TamanhoItem[]; preco_venda: number
}

/* Busca estoque diretamente no banco (sem HTTP interno) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarEstoque(admin: any, userId: string, produto: string, marca: string): Promise<{ catalogo: string; itens: EstoqueItem[] }> {
  const termos = [produto, marca].filter(Boolean)

  const buscas = await Promise.all(
    termos.flatMap(t => [
      admin.from('estoque').select('id,nome,marca,cor,tamanhos,preco_venda')
        .eq('user_id', userId).eq('status', 'disponivel').ilike('nome', `%${t}%`).limit(100),
      admin.from('estoque').select('id,nome,marca,cor,tamanhos,preco_venda')
        .eq('user_id', userId).eq('status', 'disponivel').ilike('marca', `%${t}%`).limit(100),
    ])
  )

  const visto = new Set<string>()
  const itens: EstoqueItem[] = []
  for (const { data } of buscas) {
    for (const item of (data ?? []) as EstoqueItem[]) {
      if (!visto.has(item.id)) { visto.add(item.id); itens.push(item) }
    }
  }

  const comEstoque = itens.filter(i => (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0))

  const catalogo = comEstoque.map(i => {
    const tam = (i.tamanhos as TamanhoItem[])
      .filter(t => t.qtd > 0)
      .map(t => `${t.tamanho}(${t.qtd})`).join(' ')
    const cor = i.cor ? ` | ${i.cor}` : ''
    return `• ${i.nome}${cor} — ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
  }).join('\n')

  return { catalogo: catalogo || '', itens: comEstoque }
}

/* Envia mensagem ao dono e salva no banco */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notificarDono(admin: any, userId: string, ownerPhone: string, mensagem: string) {
  try {
    await sendWhatsAppMessage({ phone: ownerPhone, message: mensagem })

    const phone = ownerPhone.startsWith('55') ? ownerPhone : `55${ownerPhone}`
    const { data: contato } = await admin
      .from('whatsapp_contatos').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle()
    if (contato?.id) {
      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: userId, contato_id: contato.id,
        direcao: 'enviada', tipo: 'texto',
        conteudo: mensagem, status: 'enviada', timestamp,
      })
    }
  } catch { /* silencioso — não deixa cair o atendimento */ }
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { contatoId, userId, mensagem, instrucaoOwner } = await request.json()
  if (!contatoId || !userId || !mensagem) return NextResponse.json({ ok: false })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: config }, { data: contato }, { data: mensagens }, { data: insights }, conhecimento, { data: tarefaAtiva }] = await Promise.all([
    admin.from('loja_config').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('whatsapp_contatos').select('nome, phone, cliente_id, clientes(genero)').eq('id', contatoId).single(),
    admin.from('whatsapp_mensagens')
      .select('direcao, conteudo, timestamp')
      .eq('contato_id', contatoId)
      .order('timestamp', { ascending: false })
      .limit(20),
    admin.from('contato_insights')
      .select('marca_principal, marcas_favoritas, fidelidade_marca, tamanhos, resumo')
      .eq('contato_id', contatoId)
      .maybeSingle(),
    carregarConhecimento(admin, userId),
    admin.from('agente_conversa_estado')
      .select('id, tarefa_id, status')
      .eq('contato_id', contatoId)
      .in('status', ['iniciando', 'aguardando', 'processando'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!contato) return NextResponse.json({ ok: false })
  if (config?.ativo === false) return NextResponse.json({ ok: true, skipped: 'inativo' })

  const mensagensOrdenadas = (mensagens ?? []).reverse()

  /* ── MODO TAREFA: cliente interagiu durante uma missão do Gerente ──
     Vem ANTES do throttle: executarTurnoTarefa tem trava e agregação
     próprias, então nunca duplica — e o throttle engoliria respostas
     que o cliente manda logo depois da pergunta do agente */
  if (tarefaAtiva) {
    const resultado = await executarTurnoTarefa(admin, userId, tarefaAtiva.tarefa_id, contatoId)
    return NextResponse.json({ modo: 'tarefa', ...resultado })
  }

  /* Throttle: evita dupla resposta em janela de 15 segundos */
  const ultimaEnviada = [...(mensagens ?? [])].find(m => m.direcao === 'enviada')
  if (!instrucaoOwner && ultimaEnviada) {
    const delta = Date.now() - new Date(ultimaEnviada.timestamp).getTime()
    if (delta < 15000) return NextResponse.json({ ok: true, skipped: 'throttled' })
  }

  const horario   = config?.horario   ?? HORARIO_PADRAO
  const endereco  = config?.endereco  ?? ENDERECO_PADRAO
  const infoExtra = config?.info_extra ? `\nInfo extra: ${config.info_extra}` : ''
  const ownerPhone = (config?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')

  const historico = mensagensOrdenadas
    .map(m => `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo}`)
    .join('\n')

  const respostasLoja = mensagensOrdenadas.filter(m => m.direcao === 'enviada').length
  const nomeCliente = contato.nome?.split(' ')[0] ?? 'cliente'

  /* Perfil do cliente baseado em histórico de compras */
  const perfilCliente = (() => {
    if (!insights) return ''
    const partes: string[] = []
    if (insights.marca_principal) {
      const nivel = insights.fidelidade_marca
      const label = nivel === 'fa_absoluto' ? 'fã absoluto' : nivel === 'fiel' ? 'cliente fiel' : 'prefere'
      partes.push(`${label} de ${insights.marca_principal}`)
    }
    if (Array.isArray(insights.marcas_favoritas) && insights.marcas_favoritas.length > 1) {
      partes.push(`marcas favoritas: ${(insights.marcas_favoritas as string[]).join(', ')}`)
    }
    if (Array.isArray(insights.tamanhos) && insights.tamanhos.length > 0) {
      partes.push(`tamanho(s): ${(insights.tamanhos as string[]).join(', ')}`)
    }
    return partes.length > 0 ? `\nPERFIL DO CLIENTE: ${partes.join(' | ')}` : ''
  })()

  const instrucaoExtra = instrucaoOwner
    ? `\nINSTRUÇÃO DO DONO: "${instrucaoOwner}" — execute isso para o cliente.`
    : ''

  const systemPrompt = `Você é o Moca, dono da loja de roupas em Roda Velha/BA, respondendo pelo WhatsApp pessoal.
Fale como o próprio dono: informal, direto, caloroso. NUNCA robótico. Se já conversou antes, não se reapresente.

PERSONALIDADE: Natural, simpático, vendedor brasileiro de verdade.${instrucaoExtra}${perfilCliente}

${conhecimento || ''}

HORÁRIO: ${horario}
ENDEREÇO: ${endereco}${infoExtra}

HISTÓRICO DA CONVERSA (mais recente embaixo):
${historico || 'Início da conversa'}

REGRAS:
1. Cumprimento simples ("oi", "olá", "bom dia"): MAX 3 palavras. NÃO pergunte nada.
2. Já respondeu antes (${respostasLoja} respostas da loja no histórico): NÃO repita cumprimento.
3. Produto/marca/preço/tamanho/cor → buscar_estoque: true
4. Palavra solta de produto ("camiseta", "boné", "calça", "vestido") → buscar_estoque: true
5. Cliente reagiu a PREÇO ("caro", "salgado") → pode_responder: true, sem buscar estoque, ofereça alternativa mais barata
6. Cliente reagiu negativamente ("não gostei", "não quero") → empatia + ofereça alternativa
7. Emoji, figurinha, "ok", "sim", "não" sozinhos SEM histórico → pode_responder: false. COM histórico de conversa recente → pode_responder: true, responda brevemente confirmando
8. NUNCA diga que mensagem chegou em branco
9. NUNCA mais de 1 pergunta por vez
10. NUNCA use # ou ## no texto
11. Não sabe → escale, nunca invente

JSON APENAS:
{
  "pode_responder": true,
  "resposta": "mensagem curta e natural",
  "escalar": false,
  "motivo_escalar": "o que o cliente quer (só se escalar=true)",
  "buscar_estoque": false,
  "marca": "marca ou categoria buscada",
  "produto": "produto exato buscado"
}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: `CLIENTE: ${nomeCliente}\nMENSAGEM: "${mensagem}"` }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null
  if (!acao) return NextResponse.json({ ok: false, error: 'IA sem JSON' })

  let respostaFinal: string | null = null

  if (acao.buscar_estoque) {
    /* Se cliente tem marca favorita e não especificou marca, busca também pela favorita */
    const marcaBusca = acao.marca || (insights?.marca_principal as string | null) || ''
    const { catalogo, itens } = await buscarEstoque(
      admin, userId, acao.produto ?? '', marcaBusca
    )

    if (itens.length > 0) {
      const temMarcaFavorita = insights?.marca_principal &&
        itens.some(i => i.marca?.toLowerCase().includes((insights.marca_principal as string).toLowerCase()))

      const contextoMarca = temMarcaFavorita
        ? ` (incluindo opções da ${insights!.marca_principal as string}, que é a preferida dele)`
        : ''

      /* Resposta curta pro cliente: confirma que tem + avisa que vai enviar foto */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Atendente da MADS loja de roupas. Cliente ${nomeCliente} perguntou: "${instrucaoOwner ?? mensagem}". TEMOS em estoque${contextoMarca}.
Responda em 1-2 frases curtas confirmando que temos e que vai chamar o vendedor pra enviar as fotos.
${temMarcaFavorita ? `Mencione que tem a marca favorita dele (${insights!.marca_principal as string}) de forma natural.` : ''}
Tom: animada, natural, brasileira. SEM lista, SEM preço, SEM nome de produto.`,
        }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()

      /* Avisa o dono com o catálogo detalhado */
      if (ownerPhone) {
        const nomeProduto = acao.produto ?? acao.marca ?? 'produto'
        const aviso = `🛍️ *${nomeCliente}* quer *${nomeProduto}*\n\n${catalogo}\n\n📸 Envie as fotos pra ele!`
        notificarDono(admin, userId, ownerPhone, aviso).catch(() => null)
      }
    } else {
      /* Não tem no estoque */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Atendente da MADS. Cliente perguntou por "${instrucaoOwner ?? mensagem}" mas NÃO temos em estoque.
1 frase gentil dizendo que não temos no momento. Ofereça verificar outro produto. Sem listas.`,
        }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()
    }
  } else if (acao.pode_responder && acao.resposta) {
    respostaFinal = acao.resposta
  } else if (acao.escalar) {
    const phoneLimpo = contato.phone.replace(/\D/g, '')
    const contatoEhDono = ownerPhone && (phoneLimpo.slice(-11) === ownerPhone.slice(-11) || phoneLimpo.slice(-10) === ownerPhone.slice(-10))
    if (ownerPhone && !contatoEhDono) {
      const msgOwner = `🔔 *${nomeCliente}* está esperando:\n\n"${acao.motivo_escalar ?? mensagem}"\n\nResponda aqui que eu encaminho.`
      notificarDono(admin, userId, ownerPhone, msgOwner).catch(() => null)
      try {
        await admin.from('atendimento_escalacoes').insert({
          user_id: userId, contato_id: contatoId,
          pergunta: acao.motivo_escalar ?? mensagem,
          status: 'pendente', agente_msg: msgOwner,
          updated_at: new Date().toISOString(),
        })
      } catch { /* silencioso */ }
    }
    return NextResponse.json({ ok: true, escalado: true })
  }

  if (respostaFinal) {
    try { await sendWhatsAppMessage({ phone: contato.phone, message: respostaFinal }) }
    catch (err) { return NextResponse.json({ ok: false, error: String(err) }) }

    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contatoId,
      direcao: 'enviada', tipo: 'texto',
      conteudo: respostaFinal, status: 'enviada', timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: respostaFinal, ultima_mensagem_at: timestamp,
    }).eq('id', contatoId)
  }

  return NextResponse.json({ ok: true, respondeu: !!respostaFinal })
}
