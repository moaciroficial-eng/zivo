import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { varrerConversasPendentes } from '@/lib/agentes/varredura'
import { lojasAtivas } from '@/lib/loja'

export const maxDuration = 60

/* Roda a cada minuto (vercel cron): garante que campanhas de cadastro
   avancem mesmo se o encadeamento 1-a-1 travar — drena os 'iniciando'
   presos e reprocessa respostas pendentes. Rede de segurança da fila. */
export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Multi-tenant: drena as conversas de cada loja ativa */
  let total = 0
  for (const loja of await lojasAtivas(admin)) {
    total += await varrerConversasPendentes(admin, loja.userId)
  }
  return NextResponse.json({ ok: true, redisparadas: total })
}
