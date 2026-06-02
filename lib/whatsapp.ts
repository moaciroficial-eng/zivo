const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

type SendTextOptions = {
  phone: string   // formato: 5511999999999 (DDI + DDD + número, sem + ou espaços)
  message: string
}

type EvolutionResponse = {
  key: { id: string }
  message: { conversation: string }
  messageTimestamp: number
  status: string
}

export async function sendWhatsAppMessage({ phone, message }: SendTextOptions): Promise<EvolutionResponse> {
  if (!BASE_URL || !API_KEY || !INSTANCE) {
    throw new Error('Evolution API não configurada. Verifique EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.')
  }

  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: JSON.stringify({
      number: phone,
      text: message,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API erro ${res.status}: ${body}`)
  }

  return res.json() as Promise<EvolutionResponse>
}
