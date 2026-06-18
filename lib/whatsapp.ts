const INSTANCE = process.env.ZAPI_INSTANCE_ID
const TOKEN    = process.env.ZAPI_TOKEN
const BASE     = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}`

type SendOptions = { phone: string; message: string }

export async function sendWhatsAppMessage({ phone, message }: SendOptions): Promise<{ messageId?: string }> {
  if (!INSTANCE || !TOKEN) {
    throw new Error('Z-API não configurada. Verifique ZAPI_INSTANCE_ID e ZAPI_TOKEN.')
  }

  const normalized = phone.replace(/\D/g, '')
  const number = normalized.startsWith('55') ? normalized : `55${normalized}`

  const res = await fetch(`${BASE}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: number, message }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Z-API erro ${res.status}: ${body}`)
  }

  const data = await res.json().catch(() => ({}))
  return { messageId: data?.messageId ?? data?.zaapId ?? data?.id ?? undefined }
}
