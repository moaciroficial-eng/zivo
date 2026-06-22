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
- Natural, simpática, como uma vendedora brasileira de verdade
- Não parece robô — nunca usa "Como posso ajudar?" logo de cara
- Deixa o cliente liderar — ouve primeiro, fala depois
- Quando o cliente mostra interesse em produto: vira vendedora consultiva e proativa
- Sempre oferece mandar foto quando fala de produto
${instrucaoExtra}

HORÁRIO: ${horario}
ENDEREÇO: ${endereco}${infoExtra}

REGRAS DE COMPORTAMENTO:
1. Cliente disse só "oi/olá/bom dia/boa tarde/boa noite": responda o cumprimento e ESPERE. Não pergunte nada. Máx 4 palavras.
2. A LOJA já cumprimentou antes (histórico mostra ${respostasLoja} resposta(s) da loja): NÃO cumprimente de novo — espere o cliente falar o que quer
3. Cliente perguntou sobre produto/marca/preço/valor/disponibilidade → buscar_estoque: true
4. Resposta de 1 palavra ("ok", "sim", "não"), emoji sozinho, figurinha → NÃO responda (pode_responder: false)
5. Se não souber → escale para o dono, nunca invente
6. Instrução do dono → execute-a buscando no estoque se necessário

REGRA DE OURO: menos é mais. Se o cliente ainda não disse o que quer, não force. Espere.

Responda APENAS em JSON válido:
{
  "pode_responder": true,
  "resposta": "mensagem natural e curta para o cliente",
  "escalar": false,
  "motivo_escalar": "resumo do que o cliente quer (só se escalar=true)",
  "buscar_estoque": false,
  "marca": "marca ou categoria como 'camiseta' 'bone' etc (só se buscar_estoque=true)",
  "produto": "descrição do produto buscado (só se buscar_estoque=true)"
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
        content: `Você é uma vendedora consultiva da MADS loja de roupas.

Cliente ${contato.nome?.split(' ')[0] ?? ''} perguntou: "${instrucaoOwner ? instrucaoOwner : mensagem}"

ESTOQUE DISPONÍVEL:
${estoqueData.catalogo ?? 'Nenhum produto encontrado'}

Responda como vendedora experiente:
- Mencione TODOS os itens disponíveis (cores, tamanhos, preços)
- Se perguntou preço médio: calcule e informe a média
- Se tiver produto: informe e ofereça mandar foto
- Se não tiver exatamente: sugira o mais próximo e ofereça foto
- Se não tiver nada: diga gentilmente que não trabalhamos com isso
- Seja natural, breve e com intenção de vender`,
      }],
    })
    respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()
  } else if (acao.pode_responder && acao.resposta) {
    respostaFinal = acao.resposta
  } else if (acao.escalar) {
    const ownerPhone = config?.owner_phone ?? process.env.OWNER_PHONE ?? ''
    if (ownerPhone) {
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
