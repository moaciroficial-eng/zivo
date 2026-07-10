import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { rodarInteligencia } from '@/lib/inteligencia/motor'

export const maxDuration = 120

export async function GET() {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const userId = process.env.WHATSAPP_USER_ID?.replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ erro: 'WHATSAPP_USER_ID ausente' })

  /* Enriquece insights de conversa antes da análise */
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  await fetch(`${baseUrl}/api/cron/enriquecer-insights`).catch(() => null)

  /* Motor v3: mesmo motor do "Analisar agora" da aba Ações */
  const resultado = await rodarInteligencia(admin, userId)
  return NextResponse.json(resultado)
}
