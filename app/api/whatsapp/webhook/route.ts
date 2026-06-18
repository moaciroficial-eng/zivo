import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function extractZapi(body: Record<string, unknown>): { conteudo: string | null; tipo: string } {
  if (body.text)     return { conteudo: (body.text as Record<string,unknown>).message as string ?? null, tipo: 'texto' }
  if (body.image)    return { conteudo: (body.image as Record<string,unknown>).caption as string ?? '📷 Imagem', tipo: 'imagem' }
  if (body.video)    return { conteudo: (body.video as Record<string,unknown>).caption as string ?? '🎥 Vídeo', tipo: 'video' }
  if (body.audio)    return { conteudo: '🎵 Áudio', tipo: 'audio' }
  if (body.document) return { conteudo: (body.document as Record<string,unknown>).fileName as string ?? '📄 Documento', tipo: 'documento' }
  if (body.sticker)  return { conteudo: '🎯 Sticker', tipo: 'sticker' }
  if (body.location) return { conteudo: `📍 ${(body.location as Record<string,unknown>).name ?? 'Localização'}`, tipo: 'localizacao' }
  if (body.contact)  return { conteudo: '👤 Contato', tipo: 'contato' }
  return { conteudo: null, tipo: 'desconhecido' }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch { return NextResponse.json({ ok: true }) }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: true })
    }

    const payload = body as Record<string, unknown>

    const userId      = process.env.WHATSAPP_USER_ID
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!userId || !supabaseUrl || !supabaseKey) {
      console.warn('Webhook: env vars ausentes')
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    /* Z-API envia cada mensagem como um objeto raiz */
    const phone    = typeof payload.phone === 'string' ? payload.phone.replace(/\D/g, '') : null
    const fromMe   = Boolean(payload.fromMe)
    const isGroup  = Boolean(payload.isGroup)
    const msgType  = payload.type as string | undefined

    /* Ignora grupos, broadcasts e pings sem telefone */
    if (!phone || isGroup) return NextResponse.json({ ok: true })

    /* Status updates (delivery/read) */
    if (msgType === 'DeliveryCallback' || msgType === 'ReadCallback' || msgType === 'MessageStatusCallback') {
      const msgId  = payload.messageId as string | undefined
      const status = msgType === 'ReadCallback' ? 'lida' : 'entregue'
      if (msgId) {
        await supabase.from('whatsapp_mensagens').update({ status }).eq('message_id', msgId)
      }
      return NextResponse.json({ ok: true })
    }

    /* Mensagens recebidas e enviadas */
    if (msgType !== 'ReceivedCallback' && msgType !== 'SentCallback') {
      return NextResponse.json({ ok: true, ignored: msgType })
    }

    const messageId  = payload.messageId as string | undefined
    const senderName = payload.senderName as string | null | undefined
    const momment    = payload.momment as number | undefined
    const timestamp  = new Date(momment ?? Date.now()).toISOString()
    const direcao    = fromMe ? 'enviada' : 'recebida'
    const { conteudo, tipo } = extractZapi(payload)

    /* Matching automático com cliente pelo telefone */
    let clienteId: string | null = null
    const phoneLast = phone.slice(-8)
    const { data: clienteMatch } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('user_id', userId)
      .filter('telefone', 'ilike', `%${phoneLast}`)
      .maybeSingle()
    if (clienteMatch) clienteId = clienteMatch.id

    const funilEtapa = clienteId ? 'fundo' : 'topo'
    const nomeContato = senderName ?? clienteMatch?.nome ?? phone

    /* Verifica se vem de link de campanha */
    let campanhaId: string | null = null
    if (!fromMe && conteudo) {
      const { data: camp } = await supabase
        .from('campanhas')
        .select('id')
        .eq('user_id', userId)
        .filter('link_rastreamento', 'ilike', `%${conteudo.slice(0, 30)}%`)
        .maybeSingle()
      if (camp) campanhaId = camp.id
    }

    /* Upsert contato */
    const upsertData: Record<string, unknown> = {
      user_id: userId,
      phone,
      nome: nomeContato,
      ultima_mensagem: conteudo ?? tipo,
      ultima_mensagem_at: timestamp,
      cliente_id: clienteId,
      funil_etapa: funilEtapa,
    }
    if (campanhaId) upsertData.campanha_id = campanhaId

    const { data: contato, error: contatoErr } = await supabase
      .from('whatsapp_contatos')
      .upsert(upsertData, { onConflict: 'user_id,phone', ignoreDuplicates: false })
      .select('id, nao_lidas, foto_url')
      .single()

    if (contatoErr || !contato) {
      console.error('Erro upsert contato:', contatoErr)
      return NextResponse.json({ ok: true })
    }

    /* Busca foto de perfil se o contato for novo (sem foto) */
    const zapiInstance = process.env.ZAPI_INSTANCE_ID
    const zapiToken    = process.env.ZAPI_TOKEN
    const contatoAtual = contato as { id: string; nao_lidas: number; foto_url?: string | null }
    if (!contatoAtual.foto_url && !fromMe && zapiInstance && zapiToken) {
      try {
        const number = phone.startsWith('55') ? phone : `55${phone}`
        const fotoRes = await fetch(
          `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/profile-picture?phone=${number}`,
          { cache: 'no-store' }
        )
        if (fotoRes.ok) {
          const fotoData = await fotoRes.json()
          const fotoUrl = fotoData?.photo ?? fotoData?.url ?? null
          if (fotoUrl) {
            await supabase.from('whatsapp_contatos').update({ foto_url: fotoUrl }).eq('id', contato.id)
          }
        }
      } catch { /* silencioso */ }
    }

    /* Incrementa não lidas */
    if (direcao === 'recebida') {
      await supabase
        .from('whatsapp_contatos')
        .update({ nao_lidas: ((contato.nao_lidas as number) ?? 0) + 1 })
        .eq('id', contato.id)
    }

    /* Insere mensagem */
    await supabase.from('whatsapp_mensagens').upsert(
      {
        user_id:    userId,
        contato_id: contato.id,
        message_id: messageId,
        direcao,
        tipo,
        conteudo,
        status: fromMe ? 'enviada' : 'recebida',
        timestamp,
        raw: payload,
      },
      { onConflict: 'message_id', ignoreDuplicates: true },
    )

    /* Se for lead de campanha, registra em campanha_leads */
    if (campanhaId && !fromMe) {
      await supabase.from('campanha_leads').upsert(
        {
          user_id: userId,
          campanha_id: campanhaId,
          contato_id: contato.id,
          cliente_id: clienteId,
          phone,
          nome: nomeContato,
          status: 'novo',
        },
        { onConflict: 'campanha_id,phone' as never, ignoreDuplicates: true },
      )
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Webhook erro:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    webhook: 'zivo-zapi',
    env: {
      WHATSAPP_USER_ID:          !!process.env.WHATSAPP_USER_ID,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ZAPI_INSTANCE_ID:          !!process.env.ZAPI_INSTANCE_ID,
      ZAPI_TOKEN:                !!process.env.ZAPI_TOKEN,
    },
  })
}
