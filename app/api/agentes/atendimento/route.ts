import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HORARIO_PADRAO  = 'Manhã: 9h às 12h | Tarde: 14h às 19h'
const ENDERECO_PADRAO = 'Roda Velha, Bahia — Av. Paraná, ao lado do Iphome Burguer'
const OWNER_PHONE_PADRAO = process.env.OWNER_PHONE ?? '62999057784'

export async function POST(request: NextRequest) {
  const { contatoId, userId, mensagem } = await request.json()
  console.log('[atendimento] recebido:', { contatoId, userId, mensagem })
  if (!contatoId || !userId) return NextResponse.json({ ok: false })

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
      .limit(12),
  ])

  console.log('[atendimento] contato:', contato, '| config:', config)
  if (!contato) return NextResponse.json({ ok: false })
  if (config?.ativo === false) return NextResponse.json({ ok: true, skipped: 'inativo' })

  const horario    = config?.horario    ?? HORARIO_PADRAO
  const endereco   = config?.endereco   ?? ENDERECO_PADRAO
  const ownerPhone = config?.owner_phone ?? OWNER_PHONE_PADRAO
  const infoExtra  = config?.info_extra ? `\n- Informações extras: ${config.info_extra}` : ''

  const historico = (mensagens ?? []).reverse()
    .map(m => `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo}`)
    .join('\n')

  const nomeCliente = contato.nome?.split(' ')[0] ?? 'Cliente'

  const systemPrompt = `Você é o assistente automático de uma loja de roupas no Brasil.

INFORMAÇÕES DA LOJA:
- Horário de funcionamento: ${horario}
- Endereço: ${endereco}${infoExtra}
- Marcas: consulte o estoque quando o cliente perguntar sobre produtos/marcas específicas

INSTRUÇÕES:
Analise o histórico e a última mensagem do cliente. Decida o que fazer:

1. Se souber responder (saudação, horário, endereço, agradecimento, despedida) → responda diretamente
2. Se for sobre produtos/marcas/estoque → indique para buscar no estoque
3. Se NÃO souber → escale para o dono (não invente informações)

Responda APENAS em JSON válido:
{
  "pode_responder": true,
  "resposta": "mensagem para o cliente (natural, amigável, como um atendente humano)",
  "escalar": false,
  "motivo_escalar": "resumo breve do que o cliente quer (só se escalar=true)",
  "buscar_estoque": false,
  "marca": "nome da marca (só se buscar_estoque=true)",
  "produto": "descrição do produto (só se buscar_estoque=true)"
}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `CONTATO: ${contato.nome ?? contato.phone}\n\nHISTÓRICO:\n${historico}\n\nÚLTIMA MENSAGEM DO CLIENTE: "${mensagem}"`,
    }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null
  console.log('[atendimento] acao IA:', acao)
  if (!acao) return NextResponse.json({ ok: false, error: 'IA sem JSON' })

  let respostaFinal: string | null = null

  /* Busca estoque se necessário */
  if (acao.buscar_estoque && acao.marca) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
    const estoqueRes = await fetch(`${baseUrl}/api/agentes/estoque`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, marca: acao.marca, produto: acao.produto }),
    })
    const estoqueData = await estoqueRes.json()

    const resVendedor = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Cliente ${nomeCliente} perguntou: "${mensagem}"

ESTOQUE ENCONTRADO:
${estoqueData.catalogo ?? 'Nenhum item encontrado para essa busca'}

Responda como um vendedor experiente:
- Se tiver o produto: informe e ofereça mandar foto
- Se não tiver exatamente: sugira o mais próximo e ofereça foto
- Se não tiver nada próximo: diga que não trabalhamos com essa marca/produto, de forma gentil
- Seja breve, natural e com intenção de vender`,
      }],
    })
    respostaFinal = (resVendedor.content[0] as { text: string }).text.trim()

  } else if (acao.pode_responder && acao.resposta) {
    respostaFinal = acao.resposta

  } else if (acao.escalar) {
    /* Encaminha para o dono via WhatsApp */
    if (ownerPhone) {
      const msgOwner = `🔔 *Zivo — Atendimento*\n\nCliente *${contato.nome ?? contato.phone}* está aguardando:\n\n"${acao.motivo_escalar ?? mensagem}"\n\nResponda aqui e eu encaminho pra ele.`

      try {
        await sendWhatsAppMessage({ phone: ownerPhone, message: msgOwner })
      } catch { /* silencioso — não bloqueia */ }

      await admin.from('atendimento_escalacoes').insert({
        user_id:    userId,
        contato_id: contatoId,
        pergunta:   acao.motivo_escalar ?? mensagem,
        status:     'pendente',
        agente_msg: msgOwner,
        updated_at: new Date().toISOString(),
      })
    }
    return NextResponse.json({ ok: true, escalado: true })
  }

  /* Envia resposta ao cliente */
  if (respostaFinal) {
    console.log('[atendimento] enviando para', contato.phone, ':', respostaFinal)
    try {
      await sendWhatsAppMessage({ phone: contato.phone, message: respostaFinal })
    } catch (err) {
      console.error('[atendimento] erro ao enviar:', err)
      return NextResponse.json({ ok: false, error: 'falha ao enviar' })
    }
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id:    userId,
      contato_id: contatoId,
      direcao:    'enviada',
      tipo:       'texto',
      conteudo:   respostaFinal,
      status:     'enviada',
      timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem:    respostaFinal,
      ultima_mensagem_at: timestamp,
    }).eq('id', contatoId)
  }

  return NextResponse.json({ ok: true, respondeu: !!respostaFinal })
}
