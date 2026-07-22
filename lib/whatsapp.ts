const INSTANCE     = process.env.ZAPI_INSTANCE_ID
const TOKEN        = process.env.ZAPI_TOKEN
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN?.replace(/^﻿/, '').trim()

const META_PHONE_ID    = process.env.META_PHONE_NUMBER_ID
const META_TOKEN       = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
const PROVIDER_GLOBAL  = (process.env.WHATSAPP_PROVIDER || 'zapi') as WhatsAppProvider

/* Provedor de WhatsApp por loja. 'meta' = Cloud API oficial (sem risco
   de ban, mas mensagens fora da janela de 24h exigem template aprovado);
   'zapi' = gateway não-oficial (legado). */
export type WhatsAppProvider = 'zapi' | 'meta'

/* Credenciais por loja (multi-tenant). Se a loja não tiver as próprias,
   cai no env global (a loja original / Moca).
   Os campos Z-API ficam no topo por retrocompat (call sites antigos). */
export type ZapiCreds = {
  instanceId?: string | null
  token?: string | null
  clientToken?: string | null
}
export type MetaCreds = {
  phoneNumberId?: string | null
  accessToken?: string | null
  wabaId?: string | null
}
export type WhatsAppCreds = ZapiCreds & {
  provider?: WhatsAppProvider | null
  meta?: MetaCreds
}

function resolverCreds(creds?: ZapiCreds) {
  const instance = creds?.instanceId?.trim() || INSTANCE
  const token = creds?.token?.trim() || TOKEN
  const clientToken = (creds?.clientToken ?? CLIENT_TOKEN)?.replace(/^﻿/, '').trim()
  return { instance, token, clientToken }
}

function resolverMeta(meta?: MetaCreds) {
  const phoneNumberId = meta?.phoneNumberId?.trim() || META_PHONE_ID
  const accessToken = (meta?.accessToken ?? META_TOKEN)?.replace(/^﻿/, '').trim()
  return { phoneNumberId, accessToken }
}

type SendOptions = { phone: string; message: string; creds?: WhatsAppCreds }

/* ══════════════════════════════════════════════════════════════
   NORMALIZAÇÃO ÚNICA DE TELEFONE BR — usar SEMPRE que criar/buscar
   contato por telefone. Sem isso, a campanha criava o contato sem o
   9º dígito e a resposta do cliente (que vem COM o 9) caía em outro
   contato → conversa rachava em dois (caso Adriane).
   Formato canônico: 55 + DDD + 9 + 8 dígitos (13 dígitos).
   ══════════════════════════════════════════════════════════════ */
export function normalizarTelefoneBR(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  const with55 = d.startsWith('55') ? d : `55${d}`
  /* 55 + 2 DDD + 8 dígitos começando em 6-9 (celular sem o 9) → insere o 9 */
  return with55.length === 12 && /^55\d{2}[6-9]/.test(with55)
    ? `${with55.slice(0, 4)}9${with55.slice(4)}`
    : with55
}

export async function sendWhatsAppMessage({ phone, message, creds }: SendOptions): Promise<{ messageId?: string }> {
  const provider = creds?.provider || PROVIDER_GLOBAL
  const number = normalizarTelefoneBR(phone)
  if (provider === 'meta') return sendViaMeta(number, message, creds?.meta)
  return sendViaZapi(number, message, creds)
}

/* ── Envio via Z-API (gateway não-oficial / legado) ─────────── */
async function sendViaZapi(number: string, message: string, creds?: ZapiCreds): Promise<{ messageId?: string }> {
  const { instance, token, clientToken } = resolverCreds(creds)
  if (!instance || !token) {
    throw new Error('Z-API não configurada. Verifique ZAPI_INSTANCE_ID e ZAPI_TOKEN.')
  }
  if (!clientToken) {
    throw new Error('Z-API não configurada. Verifique ZAPI_CLIENT_TOKEN.')
  }

  const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': clientToken,
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

/* ── Envio via Meta Cloud API (oficial) ─────────────────────────
   Texto livre só funciona DENTRO da janela de 24h desde a última
   mensagem do cliente. Fora disso, a Meta rejeita — é preciso um
   template aprovado (ver sendWhatsAppTemplate). */
async function sendViaMeta(number: string, message: string, meta?: MetaCreds): Promise<{ messageId?: string }> {
  const { phoneNumberId, accessToken } = resolverMeta(meta)
  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta WhatsApp não configurada. Verifique META_PHONE_NUMBER_ID e META_ACCESS_TOKEN.')
  }

  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: number,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta erro ${res.status}: ${body}`)
  }

  const data = await res.json().catch(() => ({}))
  return { messageId: data?.messages?.[0]?.id ?? undefined }
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
