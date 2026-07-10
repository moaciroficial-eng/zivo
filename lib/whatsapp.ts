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

/* ══════════════════════════════════════════════════════════════
   CONTROLE DE ORIGEM — IA vs humano

   Toda mensagem enviada pela IA é gravada com raw.origem = 'ia'.
   Mensagens manuais (UI do Zivo ou celular do dono) não têm esse
   marcador. Se o dono mandou mensagem manual há pouco, ele ASSUMIU
   a conversa — a IA não pode responder por cima.
   ══════════════════════════════════════════════════════════════ */

export const JANELA_HUMANO_MINUTOS = 30

type MsgOrigem = { direcao: string; timestamp: string; raw?: unknown }

/* True se o dono (humano) mandou mensagem manual nessa conversa
   dentro da janela — a IA deve ficar em silêncio. */
export function humanoAtivoNaConversa(
  mensagens: MsgOrigem[],
  janelaMinutos: number = JANELA_HUMANO_MINUTOS,
): boolean {
  const limite = Date.now() - janelaMinutos * 60_000
  return mensagens.some(m => {
    if (m.direcao !== 'enviada') return false
    if (new Date(m.timestamp).getTime() < limite) return false
    const origem = (m.raw as { origem?: string } | null)?.origem
    return origem !== 'ia'
  })
}

/* Consulta direta ao banco (para quem não tem as mensagens em mãos) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function donoAssumiuConversa(admin: any, contatoId: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_HUMANO_MINUTOS * 60_000).toISOString()
  const { data } = await admin
    .from('whatsapp_mensagens')
    .select('direcao, timestamp, raw')
    .eq('contato_id', contatoId)
    .eq('direcao', 'enviada')
    .gte('timestamp', desde)
    .limit(20)
  return humanoAtivoNaConversa((data ?? []) as MsgOrigem[])
}
