import type { WhatsAppCreds } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   MULTI-TENANT — resolução de loja

   Cada loja vive numa linha de loja_config (por user_id). Os crons
   iteram sobre todas as lojas ativas; o webhook resolve a loja da
   mensagem que chegou. Credenciais de WhatsApp por loja, com
   fallback pro env global (loja original / Moca).
   ══════════════════════════════════════════════════════════════ */

export type Loja = {
  userId: string
  nomeLoja: string
  ownerPhone: string
  creds: WhatsAppCreds
  atendimentoAtivo: boolean   // responde cliente automaticamente?
  proativoAtivo: boolean
}

type LojaConfigRow = {
  user_id: string
  nome_loja: string | null
  owner_phone: string | null
  zapi_instance_id: string | null
  zapi_token: string | null
  zapi_client_token: string | null
  whatsapp_provider: string | null
  meta_phone_number_id: string | null
  meta_access_token: string | null
  meta_waba_id: string | null
  ativo: boolean | null
  proativo_ativo: boolean | null
  processamento_ativo: boolean | null
}

function mapLoja(c: LojaConfigRow): Loja {
  const provider = c.whatsapp_provider === 'meta' ? 'meta' : 'zapi'
  return {
    userId: c.user_id,
    nomeLoja: c.nome_loja || 'a loja',
    ownerPhone: (c.owner_phone ?? '').replace(/\D/g, ''),
    creds: {
      provider,
      instanceId: c.zapi_instance_id,
      token: c.zapi_token,
      clientToken: c.zapi_client_token,
      meta: {
        phoneNumberId: c.meta_phone_number_id,
        accessToken: c.meta_access_token,
        wabaId: c.meta_waba_id,
      },
    },
    atendimentoAtivo: c.ativo !== false,
    proativoAtivo: c.proativo_ativo !== false,
  }
}

const COLS = 'user_id, nome_loja, owner_phone, zapi_instance_id, zapi_token, zapi_client_token, whatsapp_provider, meta_phone_number_id, meta_access_token, meta_waba_id, ativo, proativo_ativo, processamento_ativo'

/* Loja original definida por env (retrocompat): usada quando o webhook
   não sabe de qual loja é a mensagem. */
export function lojaOriginalUserId(): string | null {
  const v = (process.env.WHATSAPP_USER_ID ?? '').replace(/^﻿/, '').trim()
  return v || null
}

/* Uma loja específica pelo user_id */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLoja(admin: any, userId: string): Promise<Loja | null> {
  const { data } = await admin.from('loja_config').select(COLS).eq('user_id', userId).maybeSingle()
  if (!data) return null
  const loja = mapLoja(data as LojaConfigRow)
  /* ownerPhone com fallback pro env (loja original) */
  if (!loja.ownerPhone) loja.ownerPhone = (process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
  return loja
}

/* Resolve a loja pelo phone_number_id que a Meta manda no webhook
   (a Meta diz qual dos MEUS números recebeu a mensagem). Fallback pro
   env WHATSAPP_USER_ID (loja original). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLojaByMetaPhoneId(admin: any, phoneNumberId: string): Promise<Loja | null> {
  const { data } = await admin.from('loja_config').select(COLS).eq('meta_phone_number_id', phoneNumberId).maybeSingle()
  if (data) return mapLoja(data as LojaConfigRow)
  const uid = lojaOriginalUserId()
  return uid ? getLoja(admin, uid) : null
}

/* Todas as lojas com processamento ativo — os crons iteram sobre isso.
   Se nenhuma loja tem config ainda, cai na loja original do env. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lojasAtivas(admin: any): Promise<Loja[]> {
  const { data } = await admin.from('loja_config').select(COLS).neq('processamento_ativo', false).limit(500)
  const lojas = ((data ?? []) as LojaConfigRow[]).map(mapLoja)
  if (lojas.length > 0) return lojas

  /* Fallback retrocompat: sem nenhuma loja configurada, usa o env */
  const uid = lojaOriginalUserId()
  if (!uid) return []
  return [{
    userId: uid,
    nomeLoja: process.env.NOME_LOJA || 'a loja',
    ownerPhone: (process.env.OWNER_PHONE ?? '').replace(/\D/g, ''),
    creds: {},
    atendimentoAtivo: true,
    proativoAtivo: true,
  }]
}
