import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getLoja, lojaOriginalUserId } from '@/lib/loja'

/* Diagnóstico do canal de WhatsApp — responde só BOOLEANOS e o nome do
   provedor, nunca token/credencial. Serve pra descobrir por que um envio
   caiu no provedor errado. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const uid = lojaOriginalUserId()

  const env = {
    WHATSAPP_USER_ID: !!uid,
    SUPABASE_URL: !!url,
    SERVICE_ROLE_KEY: !!key,
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER ?? '(não definido → zapi)',
    META_ACCESS_TOKEN_env: !!process.env.META_ACCESS_TOKEN,
    ZAPI_TOKEN_env: !!process.env.ZAPI_TOKEN,
  }

  if (!url || !key || !uid) {
    return NextResponse.json({ ok: false, motivo: 'env faltando', env })
  }

  const loja = await getLoja(createClient(url, key), uid).catch(e => ({ erro: String(e) } as never))
  if (!loja || 'erro' in loja) {
    return NextResponse.json({ ok: false, motivo: 'loja não encontrada pelo WHATSAPP_USER_ID', env, detalhe: loja })
  }

  return NextResponse.json({
    ok: true,
    env,
    loja: {
      nomeLoja: loja.nomeLoja,
      provider: loja.creds.provider,
      temMetaPhoneNumberId: !!loja.creds.meta?.phoneNumberId,
      temMetaAccessToken: !!loja.creds.meta?.accessToken,
      temZapiToken: !!loja.creds.token,
      ownerPhoneUltimos4: loja.ownerPhone ? loja.ownerPhone.slice(-4) : null,
    },
  })
}
