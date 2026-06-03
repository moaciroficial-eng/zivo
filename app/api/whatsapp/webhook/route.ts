import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/* ── Supabase admin client (bypassa RLS) ── */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/* ── Extrai texto legível da mensagem ── */
function extractConteudo(message: Record<string, unknown>): { conteudo: string | null; tipo: string } {
  if (message.conversation)           return { conteudo: message.conversation as string,             tipo: 'texto'     }
  if (message.extendedTextMessage)    return { conteudo: (message.extendedTextMessage as Record<string,unknown>).text as string, tipo: 'texto' }
  if (message.imageMessage)           return { conteudo: (message.imageMessage as Record<string,unknown>).caption as string ?? '📷 Imagem',   tipo: 'imagem'    }
  if (message.videoMessage)           return { conteudo: (message.videoMessage as Record<string,unknown>).caption as string ?? '🎥 Vídeo',    tipo: 'video'     }
  if (message.audioMessage)           return { conteudo: '🎵 Áudio',                                 tipo: 'audio'     }
  if (message.documentMessage)        return { conteudo: (message.documentMessage as Record<string,unknown>).fileName as string ?? '📄 Documento', tipo: 'documento' }
  if (message.stickerMessage)         return { conteudo: '🎯 Sticker',                               tipo: 'sticker'   }
  if (message.locationMessage)        return { conteudo: '📍 Localização',                           tipo: 'localizacao'}
  if (message.contactMessage)         return { conteudo: '👤 Contato',                               tipo: 'contato'   }
  return { conteudo: null, tipo: 'desconhecido' }
}

/* ── Normaliza número ── */
function normalizePhone(jid: string): string {
  return jid.replace(/@.*$/, '').replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
  /* Valida segredo na query string */
  const secret = request.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  /* user_id do dono da instância */
  const userId = process.env.WHATSAPP_USER_ID
  if (!userId) {
    return new NextResponse('WHATSAPP_USER_ID não configurado', { status: 500 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return new NextResponse('Invalid JSON', { status: 400 }) }

  const event = body.event as string

  /* ── messages.upsert — mensagem recebida ou enviada ── */
  if (event === 'messages.upsert') {
    const data = body.data as Record<string, unknown>
    if (!data) return NextResponse.json({ ok: true })

    const messages = Array.isArray(data) ? data : [data]

    for (const msg of messages) {
      try {
      const key       = (msg as Record<string, unknown>).key as Record<string, unknown> | undefined
      const remoteJid = key?.remoteJid as string | undefined
      const fromMe    = key?.fromMe as boolean

      /* Ignora mensagens sem JID ou de grupos */
      if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) continue

      const messageId   = key?.id as string | undefined
      const pushName    = (msg as Record<string, unknown>).pushName as string | null
      const message     = (msg as Record<string, unknown>).message as Record<string, unknown> | undefined
      const tsRaw       = (msg as Record<string, unknown>).messageTimestamp as number | undefined
      const phone       = normalizePhone(remoteJid)
      const timestamp   = new Date((tsRaw ?? Date.now() / 1000) * 1000).toISOString()
      const { conteudo, tipo } = message ? extractConteudo(message) : { conteudo: null, tipo: 'desconhecido' }
      const direcao     = fromMe ? 'enviada' : 'recebida'

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
            ...(direcao === 'recebida' ? {} : {}),
          },
          { onConflict: 'user_id,phone', ignoreDuplicates: false },
        )
        .select('id, nao_lidas')
        .single()

      if (contatoErr || !contato) {
        console.error('Erro upsert contato:', contatoErr)
        continue
      }

      /* Incrementa não lidas apenas para mensagens recebidas */
      if (direcao === 'recebida') {
        await supabase
          .from('whatsapp_contatos')
          .update({ nao_lidas: (contato.nao_lidas ?? 0) + 1 })
          .eq('id', contato.id)
      }

      /* Insere mensagem (ignora duplicatas pelo message_id) */
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
      } catch (err) {
        console.error('Erro ao processar mensagem:', err)
      }
    }

    return NextResponse.json({ ok: true })
  }

  /* ── messages.update — status de entrega/leitura ── */
  if (event === 'messages.update') {
    const updates = Array.isArray(body.data) ? body.data as Record<string,unknown>[] : []
    for (const upd of updates) {
      const key    = upd.key as Record<string, unknown>
      const status = upd.status as string
      const msgId  = key?.id as string
      if (!msgId || !status) continue
      const mapped = status === 'READ' ? 'lida' : status === 'DELIVERY_ACK' ? 'entregue' : null
      if (mapped) {
        await supabase
          .from('whatsapp_mensagens')
          .update({ status: mapped })
          .eq('message_id', msgId)
      }
    }
    return NextResponse.json({ ok: true })
  }

  /* Outros eventos ignorados */
  return NextResponse.json({ ok: true, ignored: event })
}

/* Evolution API faz GET para verificar o webhook */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret === process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ status: 'ok', webhook: 'zivo-whatsapp' })
  }
  return new NextResponse('Unauthorized', { status: 401 })
}
