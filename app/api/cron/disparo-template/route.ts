import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getLoja } from '@/lib/loja'
import { processarLoteDisparo } from '@/lib/campanhas/disparo-template'

export const maxDuration = 120

/* Dispara os agendamentos vencidos (data/hora marcada na tela). Roda a cada
   15 min (vercel.json) -- mais frequente que o cron diário de lembretes,
   porque aqui o dono escolheu um HORÁRIO específico. Processa em lotes por
   disparo e por execução; se sobrar gente, continua na próxima chamada. */
export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: vencidos } = await admin.from('disparo_templates')
    .select('id, user_id')
    .in('status', ['agendado', 'enviando'])
    .lte('agendado_para', new Date().toISOString())
    .limit(10)

  if (!vencidos?.length) return NextResponse.json({ ok: true, processados: 0 })

  const credsCache = new Map<string, Awaited<ReturnType<typeof getLoja>>>()
  let processados = 0, enviados = 0, falhas = 0

  for (const d of vencidos) {
    let loja = credsCache.get(d.user_id)
    if (loja === undefined) { loja = await getLoja(admin, d.user_id).catch(() => null); credsCache.set(d.user_id, loja) }
    const r = await processarLoteDisparo(admin, d.id, loja?.creds)
    processados += r.processados
    enviados += r.enviados
    falhas += r.falhas
  }

  return NextResponse.json({ ok: true, processados, enviados, falhas })
}
