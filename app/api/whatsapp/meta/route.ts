import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { processarEventoInbound } from '@/lib/whatsapp-inbound'
import { getLojaByMetaPhoneId } from '@/lib/loja'

/* ══════════════════════════════════════════════════════════════
   Webhook da Meta WhatsApp Cloud API (oficial)

   GET  → verificação (a Meta chama uma vez com hub.challenge).
   POST → eventos. O formato da Meta é totalmente diferente da Z-API,
          então normalizamos cada mensagem/status pro shape "raiz da
          Z-API" e mandamos pro pipeline compartilhado. A loja é
          resolvida pelo phone_number_id (a Meta diz qual número recebeu).
   ══════════════════════════════════════════════════════════════ */

/* ── Verificação (Meta faz um GET ao configurar o webhook) ─────── */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode      = params.get('hub.mode')
  const token     = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

/* ── Normalização Meta → shape Z-API ───────────────────────────── */
type MetaMessage = Record<string, unknown>

function normalizarMensagem(m: MetaMessage, nomeContato: string | null): Record<string, unknown> {
  const tipo = m.type as string
  const base: Record<string, unknown> = {
    type: 'ReceivedCallback',
    fromMe: false,
    isGroup: false,
    phone: String(m.from ?? ''),
    messageId: m.id as string,
    senderName: nomeContato,
    momment: m.timestamp ? Number(m.timestamp) * 1000 : Date.now(),
  }

  switch (tipo) {
    case 'text':
      base.text = { message: (m.text as Record<string, unknown>)?.body ?? '' }
      break
    case 'image':
      base.image = { caption: (m.image as Record<string, unknown>)?.caption ?? null }
      break
    case 'video':
      base.video = { caption: (m.video as Record<string, unknown>)?.caption ?? null }
      break
    case 'audio':
    case 'voice':
      base.audio = {}
      break
    case 'document':
      base.document = { fileName: (m.document as Record<string, unknown>)?.filename ?? null }
      break
    case 'sticker':
      base.sticker = {}
      break
    case 'location':
      base.location = { name: (m.location as Record<string, unknown>)?.name ?? null }
      break
    case 'contacts':
      base.contact = {}
      break
    default:
      /* tipo não suportado — deixa o pipeline ignorar (sem conteúdo) */
      break
  }
  return base
}

function normalizarStatus(s: Record<string, unknown>): Record<string, unknown> | null {
  const status = s.status as string
  const tipo = status === 'read' ? 'ReadCallback'
    : (status === 'delivered' || status === 'sent') ? 'DeliveryCallback'
    : null
  if (!tipo) return null
  return {
    type: tipo,
    phone: String(s.recipient_id ?? ''),
    messageId: s.id as string,
    fromMe: true,
    isGroup: false,
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch { return NextResponse.json({ ok: true }) }

    if (!body || typeof body !== 'object') return NextResponse.json({ ok: true })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ok: true })
    const supabase = createClient(supabaseUrl, supabaseKey)

    const entries = ((body as Record<string, unknown>).entry as Record<string, unknown>[]) ?? []
    for (const entry of entries) {
      const changes = (entry.changes as Record<string, unknown>[]) ?? []
      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined
        if (!value) continue

        const metadata = value.metadata as Record<string, unknown> | undefined
        const phoneNumberId = metadata?.phone_number_id as string | undefined
        if (!phoneNumberId) continue

        /* Resolve a loja dona deste número */
        const loja = await getLojaByMetaPhoneId(supabase, phoneNumberId).catch(() => null)
        if (!loja) continue

        /* Nome do contato (a Meta manda em contacts[]) */
        const contacts = (value.contacts as Record<string, unknown>[]) ?? []
        const nomeContato = (contacts[0]?.profile as Record<string, unknown> | undefined)?.name as string | null ?? null

        /* Mensagens recebidas */
        const mensagens = (value.messages as MetaMessage[]) ?? []
        for (const m of mensagens) {
          const payload = normalizarMensagem(m, nomeContato)
          payload.__creds = loja.creds
          await processarEventoInbound(supabase, loja.userId, payload)
        }

        /* Status (entregue/lida) */
        const statuses = (value.statuses as Record<string, unknown>[]) ?? []
        for (const s of statuses) {
          const payload = normalizarStatus(s)
          if (!payload) continue
          payload.__creds = loja.creds
          await processarEventoInbound(supabase, loja.userId, payload)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook Meta erro:', err)
    return NextResponse.json({ ok: true })
  }
}
