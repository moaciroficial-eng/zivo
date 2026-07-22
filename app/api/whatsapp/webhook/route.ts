import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { processarEventoInbound } from '@/lib/whatsapp-inbound'
import { getLoja } from '@/lib/loja'

/* Webhook Z-API (gateway não-oficial / legado).
   A Z-API entrega cada mensagem como um objeto raiz já no formato que
   o pipeline compartilhado espera — então aqui só validamos a origem,
   resolvemos a loja e repassamos. */

export async function POST(request: NextRequest) {
  try {
    /* Validação de origem: se ZAPI_WEBHOOK_TOKEN estiver configurado, o
       webhook só aceita chamadas com ?token=<valor> na URL. */
    const tokenEsperado = process.env.ZAPI_WEBHOOK_TOKEN
    if (tokenEsperado && request.nextUrl.searchParams.get('token') !== tokenEsperado) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    let body: unknown
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch { return NextResponse.json({ ok: true }) }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: true })
    }

    const payload = body as Record<string, unknown>

    /* Multi-tenant: a loja vem na URL do webhook (?loja=<user_id>).
       Fallback pro env WHATSAPP_USER_ID (loja original / Moca). */
    const userId      = request.nextUrl.searchParams.get('loja')?.trim()
                       || process.env.WHATSAPP_USER_ID
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!userId || !supabaseUrl || !supabaseKey) {
      console.warn('Webhook: loja/env ausentes')
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    /* Anexa as credenciais da loja pra os envios internos usarem o
       provedor certo (fallback env dentro do resolver). */
    const cleanUserId = userId.replace(/^﻿/, '').trim()
    const loja = await getLoja(supabase, cleanUserId).catch(() => null)
    if (loja) payload.__creds = loja.creds

    await processarEventoInbound(supabase, cleanUserId, payload)
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Webhook erro:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    webhook: 'zivo-zapi',
    env: {
      WHATSAPP_USER_ID:          !!process.env.WHATSAPP_USER_ID,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ZAPI_INSTANCE_ID:          !!process.env.ZAPI_INSTANCE_ID,
      ZAPI_TOKEN:                !!process.env.ZAPI_TOKEN,
    },
  })
}
