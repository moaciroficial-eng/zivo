import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { processarEventoInbound } from '@/lib/whatsapp-inbound'
import { getLojaByMetaPhoneId } from '@/lib/loja'

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'

/* Confere a assinatura HMAC-SHA256 que a Meta manda em X-Hub-Signature-256.
   Sem isso qualquer um que descobrir a URL poderia forjar mensagens (spam +
   gasto de IA). Só valida quando META_APP_SECRET está configurado. */
function assinaturaMetaValida(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return true // sem segredo configurado: não bloqueia (retrocompat)
  if (!header) return false
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  if (header.length !== esperado.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(esperado))
  } catch {
    return false
  }
}

/* Baixa a mídia da Meta (URL protegida por token, expira) e re-hospeda no
   storage público pra o inbox conseguir exibir. Retorna a URL pública. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function baixarMidiaMeta(mediaId: string, accessToken: string, supabase: any, userId: string): Promise<string | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    })
    if (!metaRes.ok) return null
    const info = await metaRes.json()
    const url = info?.url as string | undefined
    const mime = (info?.mime_type as string | undefined) || 'image/jpeg'
    if (!url) return null

    const bin = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
    if (!bin.ok) return null
    const buf = Buffer.from(await bin.arrayBuffer())

    const ext = (mime.split('/')[1] || 'jpg').split(';')[0]
    const path = `whatsapp/${userId}/${Date.now()}-${mediaId}.${ext}`
    const { data, error } = await supabase.storage.from('biblioteca').upload(path, buf, { contentType: mime })
    if (error) return null
    const { data: pub } = supabase.storage.from('biblioteca').getPublicUrl(data.path)
    return pub?.publicUrl ?? null
  } catch {
    return null
  }
}

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
      base.image = {
        caption: (m.image as Record<string, unknown>)?.caption ?? null,
        id: (m.image as Record<string, unknown>)?.id ?? null,
      }
      break
    case 'video':
      base.video = { caption: (m.video as Record<string, unknown>)?.caption ?? null }
      break
    case 'audio':
    case 'voice': {
      const a = (m.audio ?? m.voice) as Record<string, unknown> | undefined
      base.audio = { id: a?.id ?? null }
      break
    }
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
    const rawBody = await request.text()

    /* Rejeita webhooks forjados (assinatura inválida) */
    if (!assinaturaMetaValida(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new NextResponse('Invalid signature', { status: 401 })
    }

    let body: unknown
    try {
      if (rawBody) body = JSON.parse(rawBody)
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

          const token = loja.creds?.meta?.accessToken as string | undefined

          /* Imagem: baixa da Meta e re-hospeda pra o inbox exibir (raw.image.imageUrl) */
          const img = payload.image as Record<string, unknown> | undefined
          if (img?.id && token) {
            const publicUrl = await baixarMidiaMeta(String(img.id), token, supabase, loja.userId)
            if (publicUrl) img.imageUrl = publicUrl
          }

          /* Áudio: baixa e re-hospeda pra o inbox tocar (raw.audio.audioUrl) */
          const aud = payload.audio as Record<string, unknown> | undefined
          if (aud?.id && token) {
            const publicUrl = await baixarMidiaMeta(String(aud.id), token, supabase, loja.userId)
            if (publicUrl) aud.audioUrl = publicUrl
          }

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
