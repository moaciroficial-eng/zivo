import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rodarInteligencia } from '@/lib/inteligencia/motor'
import { enviarResumoDiario } from '@/lib/inteligencia/digest'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  /* Só a Vercel (cron) pode chamar quando CRON_SECRET está configurado */
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

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

  /* Resumo diário no WhatsApp do dono — aprova respondendo o número */
  let digest = { enviado: false, itens: 0 }
  if (resultado.ok) {
    try { digest = await enviarResumoDiario(admin, userId) } catch { /* não derruba o cron */ }
  }

  return NextResponse.json({ ...resultado, digest })
}
