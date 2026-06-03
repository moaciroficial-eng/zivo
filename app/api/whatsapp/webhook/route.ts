import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function extractConteudo(message: Record<string, unknown>): { conteudo: string | null; tipo: string } {
  if (message.conversation)        return { conteudo: message.conversation as string, tipo: 'texto' }
  if (message.extendedTextMessage) return { conteudo: ((message.extendedTextMessage as Record<string, unknown>).text as string) ?? null, tipo: 'texto' }
  if (message.imageMessage)        return { conteudo: ((message.imageMessage as Record<string, unknown>).caption as string) ?? '📷 Imagem', tipo: 'imagem' }
  if (message.videoMessage)        return { conteudo: ((message.videoMessage as Record<string, unknown>).caption as string) ?? '🎥 Vídeo', tipo: 'video' }
  if (message.audioMessage)        return { conteudo: '🎵 Áudio', tipo: 'audio' }
  if (message.documentMessage)     return { conteudo: ((message.documentMessage as Record<string, unknown>).fileName as string) ?? '📄 Documento', tipo: 'documento' }
  if (message.stickerMessage)      return { conteudo: '🎯 Sticker', tipo: 'sticker' }
  if (message.locationMessage)     return { conteudo: '📍 Localização', tipo: 'localizacao' }
  if (message.contactMessage)      return { conteudo: '👤 Contato', tipo: 'contato' }
  return { conteudo: null, tipo: 'desconhecido' }
}

function normalizePhone(jid: unknown): string {
  if (typeof jid !== 'string') return ''
  return jid.replace(/@.*$/, '').replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
  try {
    /* Valida segredo */
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const userId = process.env.WHATSAPP_USER_ID
    if (!userId) {
      console.error('WHATSAPP_USER_ID não configurado')
      return new NextResponse('WHATSAPP_USER_ID não configurado', { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase env vars ausentes')
      return new NextResponse('Supabase não configurado', { status: 500 })
    }

    /* Criado dentro do handler para garantir que as env vars existem */
    const supabase = createClient(supabaseUrl, supabaseKey)

    /* Parse do body */
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new NextResponse('Invalid JSON', { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: true, ignored: 'invalid body' })
    }

    const payload = body as Record<string, unknown>
    const event = payload.event as string | undefined

    /* ── messages.upsert ── */
    if (event === 'messages.upsert') {
      const rawData = payload.data
      if (!rawData) return NextResponse.json({ ok: true })

      const messages: unknown[] = Array.isArray(rawData) ? rawData : [rawData]

      for (const rawMsg of messages) {
        try {
          if (!rawMsg || typeof rawMsg !== 'object') continue
          const msg = rawMsg as Record<string, unknown>

          const key       = msg.key as Record<string, unknown> | undefined
          const remoteJid = key?.remoteJid
          const fromMe    = Boolean(key?.fromMe)

          /* Ignora mensagens sem JID, grupos e broadcasts */
          if (typeof remoteJid !== 'string') continue
          if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) continue

          const messageId = key?.id as string | undefined
          const pushName  = msg.pushName as string | null | undefined
          const message   = msg.message as Record<string, unknown> | undefined
          const tsRaw     = msg.messageTimestamp as number | undefined
          const phone     = normalizePhone(remoteJid)

          if (!phone) continue

          const timestamp = new Date((tsRaw ?? Date.now() / 1000) * 1000).toISOString()
          const { conteudo, tipo } = message ? extractConteudo(message) : { conteudo: null, tipo: 'desconhecido' }
          const direcao = fromMe ? 'enviada' : 'recebida'

          /* Upsert contato */
          const { data: contato, error: contatoErr } = await supabase
            .from('whatsapp_contatos')
            .upsert(
              {
                user_id: userId,
                phone,
                nome: pushName ?? phone,
                ultima_mensagem: conteudo ?? tipo,
                ultima_mensagem_at: timestamp,
              },
              { onConflict: 'user_id,phone', ignoreDuplicates: false },
            )
            .select('id, nao_lidas')
            .single()

          if (contatoErr || !contato) {
            console.error('Erro upsert contato:', contatoErr)
            continue
          }

          if (direcao === 'recebida') {
            await supabase
              .from('whatsapp_contatos')
              .update({ nao_lidas: ((contato.nao_lidas as number) ?? 0) + 1 })
              .eq('id', contato.id)
          }

          await supabase
            .from('whatsapp_mensagens')
            .upsert(
              {
                user_id:    userId,
                contato_id: contato.id,
                message_id: messageId,
                direcao,
                tipo,
                conteudo,
                status:     fromMe ? 'enviada' : 'recebida',
                timestamp,
                raw:        msg,
              },
              { onConflict: 'message_id', ignoreDuplicates: true },
            )
        } catch (msgErr) {
          console.error('Erro ao processar msg individual:', msgErr)
        }
      }

      return NextResponse.json({ ok: true })
    }

    /* ── messages.update ── */
    if (event === 'messages.update') {
      const rawUpdates = payload.data
      const updates: unknown[] = Array.isArray(rawUpdates) ? rawUpdates : []

      for (const rawUpd of updates) {
        try {
          if (!rawUpd || typeof rawUpd !== 'object') continue
          const upd    = rawUpd as Record<string, unknown>
          const key    = upd.key as Record<string, unknown> | undefined
          const status = upd.status as string | undefined
          const msgId  = key?.id as string | undefined

          if (!msgId || !status) continue

          const mapped =
            status === 'READ'          ? 'lida'     :
            status === 'DELIVERY_ACK'  ? 'entregue' : null

          if (mapped) {
            await supabase
              .from('whatsapp_mensagens')
              .update({ status: mapped })
              .eq('message_id', msgId)
          }
        } catch (updErr) {
          console.error('Erro ao processar update:', updErr)
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: event })

  } catch (err) {
    console.error('Erro fatal no webhook:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret === process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ status: 'ok', webhook: 'zivo-whatsapp' })
  }
  return new NextResponse('Unauthorized', { status: 401 })
}
