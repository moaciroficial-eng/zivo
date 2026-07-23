import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getLoja, lojaOriginalUserId } from '@/lib/loja'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

/* Diagnóstico do canal de WhatsApp — responde só BOOLEANOS e o nome do
   provedor, nunca token/credencial. Serve pra descobrir por que um envio
   caiu no provedor errado. */
export async function GET(request: NextRequest) {
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

  const diag = {
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
  }

  /* ?enviar=1 → dispara um envio REAL pelo mesmo caminho dos handlers
     (sem creds, igual owner/comando faz) e devolve o erro cru da Meta.
     Só envia pro ownerPhone da própria loja — não dá pra usar pra spam. */
  if (request.nextUrl.searchParams.get('enviar') === '1') {
    if (!loja.ownerPhone) {
      return NextResponse.json({ ...diag, envio: { ok: false, motivo: 'loja sem owner_phone' } })
    }
    try {
      const r = await sendWhatsAppMessage({
        phone: loja.ownerPhone,
        message: '🔧 Teste de diagnóstico do Zivo — se você recebeu isto, o envio pela Meta está funcionando.',
      })
      return NextResponse.json({ ...diag, envio: { ok: true, messageId: r.messageId ?? null } })
    } catch (e) {
      return NextResponse.json({ ...diag, envio: { ok: false, erro: e instanceof Error ? e.message : String(e) } })
    }
  }

  return NextResponse.json(diag)
}
