const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

type SendTextOptions = {
  phone: string            // número normalizado (fallback)
  jid?: string             // JID completo do WhatsApp (ex: 5511999999999@s.whatsapp.net ou @lid)
  message: string
}

type EvolutionResponse = {
  key: { id: string }
  message: { conversation: string }
  messageTimestamp: number
  status: string
}

export async function sendWhatsAppMessage({ phone, jid, message }: SendTextOptions): Promise<EvolutionResponse> {
  if (!BASE_URL || !API_KEY || !INSTANCE) {
    throw new Error('Evolution API não configurada. Verifique EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.')
  }

  // Constrói o número para envio na ordem de confiabilidade:
  // 1. JID completo armazenado (ex: 5511...@s.whatsapp.net ou @lid)
  // 2. Número brasileiro real → append @s.whatsapp.net
  // 3. Qualquer outro → tenta como-está (pode ser LID sem sufixo)
  let number: string
  if (jid) {
    number = jid
  } else if (/^55\d{10,11}$/.test(phone)) {
    number = `${phone}@s.whatsapp.net`
  } else {
    number = phone
  }

  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: JSON.stringify({
      number,
      text: message,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API erro ${res.status}: ${body}`)
  }

  return res.json() as Promise<EvolutionResponse>
}
