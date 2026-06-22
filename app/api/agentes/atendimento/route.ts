import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HORARIO_PADRAO  = 'Manhã: 9h às 12h | Tarde: 14h às 19h'
const ENDERECO_PADRAO = 'Roda Velha, Bahia — Av. Paraná, ao lado do Iphome Burguer'

export async function POST(request: NextRequest) {
  const { contatoId, userId, mensagem, instrucaoOwner } = await request.json()
  if (!contatoId || !userId || !mensagem) return NextResponse.json({ ok: false })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: config }, { data: contato }, { data: mensagens }] = await Promise.all([
    admin.from('loja_config').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('whatsapp_contatos').select('nome, phone').eq('id', contatoId).single(),
    admin.from('whatsapp_mensagens')
      .select('direcao, conteudo, timestamp')
      .eq('contato_id', contatoId)
      .order('timestamp', { ascending: false })
      .limit(15),
  ])

  if (!contato) return NextResponse.json({ ok: false })
  if (config?.ativo === false) return NextResponse.json({ ok: true, skipped: 'inativo' })

  /* Throttle: se já respondemos nos últimos 8 segundos, aguarda (evita dupla resposta) */
  const mensagensOrdenadas = (mensagens ?? []).reverse()
  const ultimaEnviada = [...(mensagens ?? [])].find(m => m.direcao === 'enviada')
  if (!instrucaoOwner && ultimaEnviada) {
    const delta = Date.now() - new Date(ultimaEnviada.timestamp).getTime()
    if (delta < 8000) return NextResponse.json({ ok: true, skipped: 'throttled' })
  }

  const horario  = config?.horario  ?? HORARIO_PADRAO
  const endereco = config?.endereco ?? ENDERECO_PADRAO
  const infoExtra = config?.info_extra ? `\n- ${config.info_extra}` : ''

  const historico = mensagensOrdenadas
    .map(m => `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo}`)
    .join('\n')

  /* Conta quantas vezes a LOJA já respondeu nesta sessão */
  const respostasLoja = mensagensOrdenadas.filter(m => m.direcao === 'enviada').length

  const instrucaoExtra = instrucaoOwner
    ? `\nINSTRUÇÃO DO DONO: "${instrucaoOwner}" — execute isso para o cliente.`
    : ''

  const systemPrompt = `Você é a atendente virtual da MADS, loja de roupas em Roda Velha/BA.

PERSONALIDADE: Natural, simpática, vendedora brasileira de verdade. NUNCA robótica.
${instrucaoExtra}

HORÁRIO: ${horario}
ENDEREÇO: ${endereco}${infoExtra}

HISTÓRICO DA CONVERSA:
${historico || 'Sem histórico'}

REGRAS OBRIGATÓRIAS:
1. Cumprimento simples ("oi", "olá", "bom dia"): MAX 3 palavras. NÃO pergunte nada.
2. Já cumprimentou (${respostasLoja} resposta(s) da loja no histórico): NÃO repita cumprimento.
3. Produto/marca/preço/tamanho/cor mencionados → buscar_estoque: true
4. Palavra solta de produto ("camiseta", "boné", "calça") → buscar_estoque: true
5. Cliente reagiu a PREÇO ("caro", "salgado", "muito", "barato") → pode_responder: true, responda naturalmente sem buscar estoque (ex: "Temos sim opções mais em conta! Qual faixa de preço tá bom pra você?")
6. Cliente reagiu negativamente ("não gostei", "não quero") → responda com empatia, ofereça alternativa
7. Emoji, figurinha, "ok", "sim", "não" sozinhos → pode_responder: false
8. NUNCA diga que mensagem chegou em branco
9. NUNCA mais de 1 pergunta por vez
10. NUNCA use # ou ## no texto
11. Não sabe responder → escale

Responda APENAS em JSON:
{
  "pode_responder": true,
  "resposta": "mensagem curta e natural",
  "escalar": false,
  "motivo_escalar": "o que o cliente quer (só se escalar=true)",
  "buscar_estoque": false,
  "marca": "marca ou categoria (só se buscar_estoque=true)",
  "produto": "produto exato buscado (só se buscar_estoque=true)"
}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `CONTATO: ${contato.nome ?? contato.phone}\n\nHISTÓRICO:\n${historico}\n\nÚLTIMA MENSAGEM: "${mensagem}"`,
    }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null
  if (!acao) return NextResponse.json({ ok: false, error: 'IA sem JSON' })

  let respostaFinal: string | null = null

  /* Busca estoque se necessário */
  if (acao.buscar_estoque) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
    const estoqueRes = await fetch(`${baseUrl}/api/agentes/estoque`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, marca: acao.marca, produto: acao.produto }),
    })
    const estoqueData = await estoqueRes.json()

    const temEstoque = estoqueData.catalogo && estoqueData.catalogo !== 'Nenhum produto encontrado'
    const nomeProduto = acao.produto ?? acao.marca ?? 'produto'
    const nomeCliente2 = contato.nome?.split(' ')[0] ?? 'cliente'

    if (temEstoque) {
      /* Resposta curta: confirma que tem + oferece foto */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Você é atendente da MADS loja de roupas. Responda em 1-2 frases CURTAS, no estilo WhatsApp.

Cliente ${nomeCliente2} perguntou por: "${instrucaoOwner ? instrucaoOwner : mensagem}"
Resultado: TEMOS esse produto em estoque.

Responda confirmando que temos e dizendo que vai chamar o vendedor pra enviar as fotos das opções.
Exemplos de tom: "Temos sim! Vou chamar nossa vendedora pra te mostrar as opções com foto 😊"
Seja natural, curta, animada. Máx 2 frases. SEM listas, SEM preços, SEM nomes de produto.`,
        }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()

      /* Avisa o dono que tem cliente interessado */
      const ownerPhone = (config?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
      if (ownerPhone) {
        const avisoEstoque = `🛍️ *${nomeCliente2}* quer *${nomeProduto}*.\n\nTemos em estoque:\n${estoqueData.catalogo}\n\nEnvie as fotos pra ele!`
        fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: ownerPhone, message: avisoEstoque, userId }),
        }).catch(() => null)
      }
    } else {
      /* Não tem no estoque */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Atendente da MADS loja de roupas. Cliente perguntou por "${instrucaoOwner ? instrucaoOwner : mensagem}" mas NÃO temos em estoque.
Responda em 1 frase gentil dizendo que não temos esse produto no momento. Ofereça verificar outro produto se quiser. Sem listas.`,
        }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()
    }
  } else if (acao.pode_responder && acao.resposta) {
    respostaFinal = acao.resposta
  } else if (acao.escalar) {
    const ownerPhone = (config?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
    /* Nunca escalar se quem mandou é o próprio dono */
    const phoneLimpo = contato.phone.replace(/\D/g, '')
    const contatoEhDono = ownerPhone && (phoneLimpo.slice(-11) === ownerPhone.slice(-11) || phoneLimpo.slice(-10) === ownerPhone.slice(-10))
    if (ownerPhone && !contatoEhDono) {
      const nomeCliente = contato.nome?.split(' ')[0] ?? contato.phone
      const msgOwner = `🔔 *Zivo*\n\nCliente *${nomeCliente}* está esperando resposta:\n\n"${acao.motivo_escalar ?? mensagem}"\n\nResponda aqui e eu encaminho.`
      try { await sendWhatsAppMessage({ phone: ownerPhone, message: msgOwner }) } catch { /* silencioso */ }
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
