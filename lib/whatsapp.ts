const INSTANCE     = process.env.ZAPI_INSTANCE_ID
const TOKEN        = process.env.ZAPI_TOKEN
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN?.replace(/^﻿/, '').trim()
const BASE         = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}`

type SendOptions = { phone: string; message: string }

export async function sendWhatsAppMessage({ phone, message }: SendOptions): Promise<{ messageId?: string }> {
  if (!INSTANCE || !TOKEN) {
    throw new Error('Z-API não configurada. Verifique ZAPI_INSTANCE_ID e ZAPI_TOKEN.')
  }
  if (!CLIENT_TOKEN) {
    throw new Error('Z-API não configurada. Verifique ZAPI_CLIENT_TOKEN.')
  }

  const normalized = phone.replace(/\D/g, '')
  const with55 = normalized.startsWith('55') ? normalized : `55${normalized}`
  /* Garante o 9 do celular brasileiro: 55 + DDD + 8 dígitos começando em 6-9 → adiciona 9 */
  const number = with55.length === 12 && /^55\d{2}[6-9]/.test(with55)
    ? `${with55.slice(0, 4)}9${with55.slice(4)}`
    : with55

  const res = await fetch(`${BASE}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone: number, message }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Z-API erro ${res.status}: ${body}`)
  }

  const data = await res.json().catch(() => ({}))
  return { messageId: data?.messageId ?? data?.zaapId ?? data?.id ?? undefined }
}
