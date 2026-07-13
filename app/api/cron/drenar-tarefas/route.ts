import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { varrerConversasPendentes } from '@/lib/agentes/varredura'

export const maxDuration = 60

/* Roda a cada minuto (vercel cron): garante que campanhas de cadastro
   avancem mesmo se o encadeamento 1-a-1 travar — drena os 'iniciando'
   presos e reprocessa respostas pendentes. Rede de segurança da fila. */
export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const userId = (process.env.WHATSAPP_USER_ID ?? '').replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ ok: false, error: 'WHATSAPP_USER_ID ausente' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const redisparadas = await varrerConversasPendentes(admin, userId)
  return NextResponse.json({ ok: true, redisparadas })
}
