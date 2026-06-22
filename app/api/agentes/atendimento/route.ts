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

PERSONALIDADE:
- Natural, simpática, vendedora brasileira de verdade
- NUNCA usa "Como posso ajudar?" — é chato e robótico
- Ouve primeiro, fala depois — deixa o cliente liderar
- Quando cliente quer produto: busca e apresenta com entusiasmo
- Oferece mandar foto quando menciona produto
${instrucaoExtra}

HORÁRIO: ${horario}
ENDEREÇO: ${endereco}${infoExtra}

REGRAS OBRIGATÓRIAS:
1. Cumprimento simples ("oi", "olá", "bom dia"): responda só o cumprimento. MAX 3 palavras. NÃO pergunte nada.
2. Já cumprimentou antes (${respostasLoja} resposta(s) no histórico): NÃO cumprimente de novo. Espere o cliente.
3. Mencionou qualquer produto/marca/preço/tamanho/cor → buscar_estoque: true
4. Mensagem vaga de 1 palavra sobre produto (ex: "camiseta", "boné", "calça") → buscar_estoque: true, produto = essa palavra
5. Emoji, figurinha, "ok", "sim", "não" sozinhos → pode_responder: false
6. NUNCA diga que a mensagem chegou em branco — se tem conteúdo, é porque tem
7. NUNCA faça mais de 1 pergunta por vez
8. NUNCA use # ou ## — use só *negrito* se precisar formatar
9. Se não souber → escale, nunca invente

REGRA DE OURO: menos é mais. Uma coisa de cada vez.

Responda APENAS em JSON:
{
  "pode_responder": true,
  "resposta": "mensagem curta e natural",
  "escalar": false,
  "motivo_escalar": "o que o cliente quer (só se escalar=true)",
  "buscar_estoque": false,
  "marca": "marca ou categoria (só se buscar_estoque=true)",
  "produto": "produto buscado (só se buscar_estoque=true)"
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

    const resVendedor = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Você é uma vendedora da MADS loja de roupas. Responda pelo WhatsApp.

Cliente: ${contato.nome?.split(' ')[0] ?? 'cliente'}
Pergunta: "${instrucaoOwner ? instrucaoOwner : mensagem}"

ESTOQUE:
${estoqueData.catalogo ?? 'Nenhum produto encontrado'}

REGRAS DE FORMATAÇÃO (WhatsApp — OBRIGATÓRIO):
- Use *negrito* para nomes de produto e preços
- NUNCA use # ou ## (aparecem como texto)
- NUNCA use listas com - ou * no início da linha (use • ou nada)
- Máximo 15 linhas no total
- Termine sempre oferecendo mandar foto

REGRAS DE RESPOSTA:
- Se achou produto: apresente de forma organizada e natural
- Se perguntou média de preço: calcule e informe
- Se não achou nada: diga gentilmente que não temos esse produto
- UMA pergunta no final no máximo (ex: "Qual tamanho você usa?")
- Seja direta, entusiasmada, brasileira`,
      }],
    })
    respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()
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
