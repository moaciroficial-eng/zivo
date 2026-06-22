import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rodarProativo } from '@/lib/agentes/proativo'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const userId    = body.userId    ?? process.env.WHATSAPP_USER_ID
  const ownerPhone = body.ownerPhone ?? process.env.OWNER_PHONE

  if (!userId || !ownerPhone) {
    return NextResponse.json({ ok: false, error: 'userId e ownerPhone obrigatórios' }, { status: 400 })
  }

  const cleanUserId = (userId as string).replace(/^﻿/, '').trim()

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Verifica se já rodou hoje */
  const { data: config } = await admin
    .from('loja_config')
    .select('proativo_ultimo_run')
    .eq('user_id', cleanUserId)
    .maybeSingle()

  const forcar = body.forcar === true
  if (!forcar && config?.proativo_ultimo_run) {
    const ultimo = new Date(config.proativo_ultimo_run)
    const hoje   = new Date()
    if (
      ultimo.getFullYear() === hoje.getFullYear() &&
      ultimo.getMonth()    === hoje.getMonth()    &&
      ultimo.getDate()     === hoje.getDate()
    ) {
      return NextResponse.json({ ok: true, skipped: 'ja_rodou_hoje' })
    }
  }

  const resultado = await rodarProativo(admin, cleanUserId, (ownerPhone as string).replace(/\D/g, ''))

  return NextResponse.json({ ok: true, ...resultado })
}

/* Permite testar via GET com ?forcar=true */
export async function GET(request: NextRequest) {
  const forcar = request.nextUrl.searchParams.get('forcar') === 'true'
  const userId     = process.env.WHATSAPP_USER_ID
  const ownerPhone = process.env.OWNER_PHONE

  if (!userId || !ownerPhone) {
    return NextResponse.json({ ok: false, error: 'env vars ausentes' }, { status: 400 })
  }

  const cleanUserId = userId.replace(/^﻿/, '').trim()

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (!forcar) {
    const { data: config } = await admin
      .from('loja_config').select('proativo_ultimo_run').eq('user_id', cleanUserId).maybeSingle()

    if (config?.proativo_ultimo_run) {
      const ultimo = new Date(config.proativo_ultimo_run)
      const hoje   = new Date()
      if (
        ultimo.getFullYear() === hoje.getFullYear() &&
        ultimo.getMonth()    === hoje.getMonth()    &&
        ultimo.getDate()     === hoje.getDate()
      ) {
        return NextResponse.json({ ok: true, skipped: 'ja_rodou_hoje' })
      }
    }
  }

  const resultado = await rodarProativo(admin, cleanUserId, ownerPhone.replace(/\D/g, ''))
  return NextResponse.json({ ok: true, ...resultado })
}
