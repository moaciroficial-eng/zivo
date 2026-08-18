import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage, sendWhatsAppImage, humanoAtivoNaConversa, primeiroNome } from '@/lib/whatsapp'
import { carregarConhecimento } from '@/lib/conhecimento'
import { executarTurnoTarefa } from '@/lib/agentes/tarefa-executor'

/* Modo tarefa pode esperar trava + debounce (~30s no pior caso) */
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HORARIO_PADRAO  = 'Manhã: 9h às 12h | Tarde: 14h às 19h'
const ENDERECO_PADRAO = ''   // sem config, não inventa endereço (evita vazar o de outra loja)

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
    await sendWhatsAppMessage({ phone: ownerPhone, message: mensagem, userId })

    const phone = ownerPhone.startsWith('55') ? ownerPhone : `55${ownerPhone}`
    const { data: contato } = await admin
      .from('whatsapp_contatos').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle()
    if (contato?.id) {
      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: userId, contato_id: contato.id,
        direcao: 'enviada', tipo: 'texto',
        conteudo: mensagem, status: 'enviada', timestamp,
        raw: { origem: 'ia' },
      })
    }
  } catch { /* silencioso — não deixa cair o atendimento */ }
}

/* Coloca o cliente na fila "para responder" do dashboard. Dedupe: mantém UMA
   pendência aberta por contato (atualiza em vez de empilhar várias). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registrarEscalacao(admin: any, userId: string, contatoId: string, pergunta: string, agenteMsg?: string | null) {
  try {
    const { data: existente } = await admin.from('atendimento_escalacoes')
      .select('id').eq('user_id', userId).eq('contato_id', contatoId).eq('status', 'pendente').maybeSingle()
    if (existente?.id) {
      await admin.from('atendimento_escalacoes').update({
        pergunta, agente_msg: agenteMsg ?? null, updated_at: new Date().toISOString(),
      }).eq('id', existente.id)
    } else {
      await admin.from('atendimento_escalacoes').insert({
        user_id: userId, contato_id: contatoId, pergunta,
        status: 'pendente', agente_msg: agenteMsg ?? null, updated_at: new Date().toISOString(),
      })
    }
  } catch { /* silencioso */ }
}

export async function POST(request: NextRequest) {
  try {
    return await handleAtendimento(request)
  } catch (err) {
    /* Sem isto o erro virava 500 mudo em produção e o cliente ficava sem
       resposta sem deixar rastro. Agora o motivo aparece no retorno. */
    console.error('[atendimento] erro fatal:', err)
    return NextResponse.json({
      ok: false,
      erro: err instanceof Error ? err.message : String(err),
    }, { status: 200 })
  }
}

async function handleAtendimento(request: NextRequest) {
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
    admin.from('whatsapp_contatos').select('nome, phone, cliente_id, fotos_pendentes, clientes(genero, observacoes)').eq('id', contatoId).single(),
    admin.from('whatsapp_mensagens')
      .select('direcao, conteudo, timestamp, raw')
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

  /* [...] copia ANTES de inverter — .reverse() muta a lista original.
     Sem a cópia, `mensagens` virava ascendente e a trava anti-duplicidade
     (mais abaixo) pegava a resposta mais ANTIGA em vez da mais recente,
     cancelando o envio pra todo cliente que já tinha 2+ respostas. Era o
     motivo do atendimento nunca responder quem já era cliente. */
  const mensagensOrdenadas = [...(mensagens ?? [])].reverse()

  /* ── HUMANO NO COMANDO: se o dono mandou mensagem manual há pouco
     (pela UI do Zivo ou pelo celular), ele assumiu a conversa — a IA
     NÃO responde por cima. Exceção: instrução explícita do dono. */
  if (!instrucaoOwner && humanoAtivoNaConversa(mensagens ?? [])) {
    return NextResponse.json({ ok: true, skipped: 'dono ativo na conversa — IA em silêncio' })
  }

  /* Reforço: se a ÚLTIMA mensagem ENVIADA foi manual do dono (sem janela de
     tempo), ele está tocando a conversa — a IA cala. Cobre o caso do dono
     ter atendido horas antes e o cliente responder depois. */
  if (!instrucaoOwner) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ultEnv = (mensagens ?? []).find((m: any) => m.direcao === 'enviada')
    const ultimaManual = ultEnv && ((ultEnv.raw as { origem?: string } | null)?.origem !== 'ia')
    if (ultimaManual) {
      return NextResponse.json({ ok: true, skipped: 'dono foi o último a falar — IA em silêncio' })
    }
  }

  /* ── CAMPANHA SEM FOTO: o cliente respondeu → manda as fotos do produto
     que ficaram pendentes (a copy prometeu "quer que eu te mande as fotos?").
     Envia, grava no histórico e limpa a pendência. */
  const fotosPendentes: string[] = Array.isArray((contato as { fotos_pendentes?: unknown }).fotos_pendentes)
    ? ((contato as { fotos_pendentes?: string[] }).fotos_pendentes ?? []).filter(u => typeof u === 'string' && u)
    : []
  if (!instrucaoOwner && fotosPendentes.length > 0 && contato.phone) {
    try {
      for (const url of fotosPendentes.slice(0, 5)) {
        await sendWhatsAppImage({ phone: contato.phone, imageUrl: url, userId })
      }
      const legenda = 'Aqui as fotos 😍 o que achou? Qualquer dúvida de tamanho ou preço é só me falar!'
      const msgId = (await sendWhatsAppMessage({ phone: contato.phone, message: legenda, userId })).messageId
      const ts = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: userId, contato_id: contatoId, message_id: msgId ?? null,
        direcao: 'enviada', tipo: 'texto', conteudo: legenda, status: 'enviada',
        timestamp: ts, raw: { origem: 'ia', via: 'fotos_campanha' },
      })
      await admin.from('whatsapp_contatos').update({
        fotos_pendentes: [], ultima_mensagem: legenda, ultima_mensagem_at: ts,
      }).eq('id', contatoId)
      return NextResponse.json({ ok: true, via: 'fotos_campanha', enviadas: fotosPendentes.length })
    } catch {
      /* se falhar o envio das fotos, limpa pra não repetir e segue o fluxo normal */
      await admin.from('whatsapp_contatos').update({ fotos_pendentes: [] }).eq('id', contatoId).then(() => {}, () => {})
    }
  }

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

  const nomeLoja  = config?.nome_loja ?? 'nossa loja'
  const horario   = config?.horario   ?? HORARIO_PADRAO
  const endereco  = config?.endereco  ?? ENDERECO_PADRAO
  const enderecoLinha = endereco ? `\nENDEREÇO: ${endereco}` : ''
  const infoExtra = config?.info_extra ? `\nInfo extra: ${config.info_extra}` : ''
  const ownerPhone = (config?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')

  const historico = mensagensOrdenadas
    .map(m => `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo}`)
    .join('\n')

  const respostasLoja = mensagensOrdenadas.filter(m => m.direcao === 'enviada').length
  const nomeCliente = primeiroNome(contato.nome, 'cliente')  // ignora email/vazio

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

  /* NOTA DO DONO sobre o cliente (campo observações). É o que o dono SABE
     dele na vida real — a IA usa pra personalizar, mas NUNCA revela ao
     cliente ("vi aqui que você compra em promoção" seria péssimo). */
  const notaDonoCliente = (() => {
    const cli = (contato as { clientes?: { observacoes?: string | null } | { observacoes?: string | null }[] } | null)?.clientes
    const obs = Array.isArray(cli) ? cli[0]?.observacoes : cli?.observacoes
    const t = (obs ?? '').trim()
    return t ? `\n📝 NOTA INTERNA DO DONO sobre este cliente (use pra personalizar, NUNCA revele ao cliente): "${t.slice(0, 200)}"` : ''
  })()

  const systemPrompt = `Você é o atendimento da loja de roupas ${nomeLoja}, respondendo pelo WhatsApp da loja.
Tom: educado, simpático e DIRETO. Brasileiro natural, mas SEM exagero — nada de melação, nada de "que máximo!", "fico super feliz!", "amei!". No MÁXIMO 1 emoji por mensagem, muitas vezes nenhum. Curto. Se já conversou antes, não se reapresente.
IMPORTANTE: você é a ASSISTENTE VIRTUAL da loja. Você NÃO é uma pessoa física, NÃO está indo/chegando a lugar nenhum, e NÃO é o dono em pessoa.

⚠️ REGRA DE OURO — SÓ FALE O QUE VOCÊ SABE: você só tem os dados de estoque e o cadastro do cliente. Se o cliente perguntar QUALQUER coisa que você não consegue verificar com CERTEZA — reserva ("vocês reservaram?", "separaram pra mim?"), status de pedido, se algo foi enviado, combinados anteriores, valores/pagamento, ou qualquer promessa — NÃO invente, NÃO diga que "vai verificar com o time", NÃO confirme nem negue. Faça escalar: true e responda apenas algo curto como "Deixa eu confirmar isso certinho e já te respondo, tá?". QUEM sabe dessas coisas é o dono, não você.

PERSONALIDADE: Natural, simpático, vendedor brasileiro de verdade.${instrucaoExtra}${perfilCliente}${notaDonoCliente}

${conhecimento || ''}

HORÁRIO: ${horario}${enderecoLinha}${infoExtra}

HISTÓRICO DA CONVERSA (mais recente embaixo):
${historico || 'Início da conversa'}

🚫 TRAVAS DE SEGURANÇA — NUNCA cruzar, em hipótese alguma:
- NUNCA invente nem envie chave PIX, CPF, conta bancária ou qualquer dado de pagamento. Cliente quer pagar / pediu o PIX / quer fechar o pagamento → escalar: true. QUEM manda o PIX é o DONO, nunca você.
- NUNCA diga que está indo, chegando, "a caminho", "na porta", "na loja", nem finja qualquer ação física. Você só atende pelo WhatsApp.
- NUNCA finja ser o dono em pessoa nem minta sobre identidade, nome ou CPF. Se o cliente perguntar "é você mesmo?", "quem fala?", ou desconfiar → seja honesto que é o atendimento da loja, ou escalar: true. NUNCA insista numa mentira pra parecer convincente.
- Fechar venda, negociar preço/desconto, cobrança, reclamação, combinar pagamento/entrega → escalar: true. Não improvise nesses temas.

REGRAS:
1. Cumprimento simples ("oi", "olá", "bom dia"): MAX 3 palavras. NÃO pergunte nada.
2. Já respondeu antes (${respostasLoja} respostas da loja no histórico): NÃO repita cumprimento.
3. Produto/marca/preço/tamanho/cor → buscar_estoque: true
4. Palavra solta de produto ("camiseta", "boné", "calça", "vestido") → buscar_estoque: true
5. Cliente reagiu a PREÇO ("caro", "salgado") → pode_responder: true, sem buscar estoque, ofereça alternativa mais barata
6. Cliente reagiu negativamente ("não gostei", "não quero") → empatia + ofereça alternativa
7. ENCERRAMENTO / CORTESIA — o pior erro é responder cortesia com cortesia pra sempre. Se o cliente só está agradecendo ou encerrando ("ok", "ta bom", "valeu", "obrigado", "por nada", "beleza", "👍", "🧡", figurinha, emoji solto) E a loja JÁ respondeu / já se despediu, então pode_responder: FALSE (fique em silêncio). Uma despedida basta — depois dela, NÃO responda mais nada. Só responda uma cortesia UMA vez, nunca em sequência.
8. NUNCA diga que mensagem chegou em branco
9. NUNCA mais de 1 pergunta por vez
10. NUNCA use # ou ## no texto
11. Não sabe / não consegue verificar (reserva, pedido, pagamento, combinado) → escalar: true, sem inventar. Melhor "vou confirmar e já te respondo" que uma resposta errada.
12. NÃO misture assuntos. Se o cliente muda de assunto (ex: pergunta de reserva no meio de outra coisa), foque no que ele perguntou — não force cadastro nem outro tema.
13. FIQUE NO ASSUNTO DA LOJA (roupas, produtos, marcas, tamanhos, cores, horário, endereço, troca, consulta de disponibilidade). Se o cliente puxar papo aleatório fora do universo da loja (política, futebol, religião, vida pessoal, piada solta), responda com UMA linha simpática e curta e traga de volta pro atendimento — sem entrar no mérito. Você é o atendimento de uma loja, não amigo de conversa fiada.
14. SEJA NATURAL, não robótico. Converse como um vendedor de verdade, no fio da conversa (você tem o histórico acima). Nada de frase decorada/repetida. Mas dentro dos limites: quando o assunto for foto do produto, fechar venda, preço, desconto ou pagamento, você NÃO resolve — quem assume é o vendedor humano (escalar/passar o bastão).

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
    model: 'claude-sonnet-4-6',
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

      /* Passagem de bastão: confirma que tem e que o vendedor já manda as fotos.
         Gerada COM o histórico na frente da IA (Sonnet) pra soar natural. */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 160,
        system: `Você é o atendimento da loja de roupas ${nomeLoja} no WhatsApp. Fale como um vendedor brasileiro experiente: caloroso, natural e direto, sem melação, no máximo 1 emoji. Se já conversaram, não se reapresente.
SITUAÇÃO: o cliente quer ver o produto e a loja TEM em estoque${contextoMarca}. Agora é a etapa das FOTOS — e quem manda as fotos é o vendedor humano da loja, que JÁ foi avisado. Sua fala é a passagem de bastão: confirma que tem e que já vão te enviar as fotos pra ver, de forma natural no contexto da conversa.
NUNCA: dizer que está enviando/passando a foto "agora, nesse instante" (o vendedor envia em seguida); inventar vendedor com nome ou fingir ser pessoa física; falar preço, pagamento, PIX, desconto ou reserva; usar #, listas ou markdown.
${temMarcaFavorita ? `Pode mencionar de leve que tem a marca preferida dele (${insights!.marca_principal as string}).` : ''}
Responda 1-2 frases. Só o texto da mensagem.
HISTÓRICO DA CONVERSA (mais recente embaixo):
${historico || 'Início da conversa'}`,
        messages: [{ role: 'user', content: `Última mensagem de ${nomeCliente}: "${instrucaoOwner ?? mensagem}"` }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()

      /* Avisa o dono (WhatsApp) + coloca na fila "clientes para responder" do
         dashboard — é a hora das fotos, o vendedor humano assume daqui. */
      const nomeProduto = acao.produto ?? acao.marca ?? 'produto'
      if (ownerPhone) {
        const aviso = `🛍️ *${nomeCliente}* quer *${nomeProduto}*\n\n${catalogo}\n\n📸 Envie as fotos pra ele!`
        notificarDono(admin, userId, ownerPhone, aviso).catch(() => null)
      }
      await registrarEscalacao(admin, userId, contatoId, `Quer ver as fotos de ${nomeProduto}`, respostaFinal)
    } else {
      /* Não tem no estoque — resposta natural, com o histórico na frente */
      const resVendedor = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        system: `Você é o atendimento da loja de roupas ${nomeLoja} no WhatsApp. Tom natural e simpático, sem exagero, no máximo 1 emoji. Se já conversaram, não se reapresente.
SITUAÇÃO: o cliente perguntou por um produto que a loja NÃO tem em estoque agora. Diga isso com gentileza e se ofereça pra ajudar com outra coisa/algo parecido — natural, no contexto da conversa. NÃO fale preço/pagamento/desconto. Sem listas, sem markdown. Só o texto da mensagem.
HISTÓRICO DA CONVERSA (mais recente embaixo):
${historico || 'Início da conversa'}`,
        messages: [{ role: 'user', content: `Última mensagem de ${nomeCliente}: "${instrucaoOwner ?? mensagem}"` }],
      })
      respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()
    }
  } else if (acao.pode_responder && acao.resposta) {
    respostaFinal = acao.resposta
  } else if (acao.escalar) {
    const phoneLimpo = contato.phone.replace(/\D/g, '')
    const contatoEhDono = ownerPhone && (phoneLimpo.slice(-11) === ownerPhone.slice(-11) || phoneLimpo.slice(-10) === ownerPhone.slice(-10))
    if (ownerPhone && !contatoEhDono) {
      const msgOwner = `🔔 *${nomeCliente}* está esperando resposta:\n\n"${acao.motivo_escalar ?? mensagem}"\n\nResponda o cliente pelo Zivo (aba WhatsApp).`
      notificarDono(admin, userId, ownerPhone, msgOwner).catch(() => null)
      await registrarEscalacao(admin, userId, contatoId, acao.motivo_escalar ?? mensagem, msgOwner)
    }
    return NextResponse.json({ ok: true, escalado: true })
  }

  if (respostaFinal) {
    /* Sanitiza: remove títulos markdown que o modelo possa ter vazado
       (ex: "# Resposta ao Cliente") e linhas vazias sobrando */
    respostaFinal = respostaFinal
      .replace(/^#{1,6}\s.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!respostaFinal) return NextResponse.json({ ok: true, skipped: 'resposta vazia após sanitizar' })

    /* Anti-corrida: outra execução respondeu enquanto esta processava?
       (duas mensagens do cliente em sequência disparam dois webhooks) */
    const { data: envRecente } = await admin
      .from('whatsapp_mensagens')
      .select('timestamp')
      .eq('contato_id', contatoId)
      .eq('direcao', 'enviada')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ultimaConhecida = [...(mensagens ?? [])].find(m => m.direcao === 'enviada')?.timestamp ?? null
    if (envRecente?.timestamp && envRecente.timestamp !== ultimaConhecida) {
      return NextResponse.json({ ok: true, skipped: 'outra resposta já foi enviada' })
    }

    let messageId: string | undefined
    try { messageId = (await sendWhatsAppMessage({ phone: contato.phone, message: respostaFinal, userId })).messageId }
    catch (err) { return NextResponse.json({ ok: false, error: String(err) }) }

    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contatoId,
      message_id: messageId ?? null,
      direcao: 'enviada', tipo: 'texto',
      conteudo: respostaFinal, status: 'enviada', timestamp,
      raw: { origem: 'ia' },
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: respostaFinal, ultima_mensagem_at: timestamp,
    }).eq('id', contatoId)
  }

  return NextResponse.json({ ok: true, respondeu: !!respostaFinal })
}
