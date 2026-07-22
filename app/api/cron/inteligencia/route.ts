import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rodarInteligencia } from '@/lib/inteligencia/motor'
import { enviarResumoDiario } from '@/lib/inteligencia/digest'
import { lojasAtivas } from '@/lib/loja'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  /* Só a Vercel (cron) pode chamar quando CRON_SECRET está configurado */
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Enriquece insights de conversa antes da análise */
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  await fetch(`${baseUrl}/api/cron/enriquecer-insights`, {
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET ?? ''}` },
  }).catch(() => null)

  /* Multi-tenant: roda o motor + resumo diário para CADA loja ativa */
  const lojas = await lojasAtivas(admin)
  const resultados: unknown[] = []
  for (const loja of lojas) {
    try {
      const resultado = await rodarInteligencia(admin, loja.userId)
      let digest = { enviado: false, itens: 0 }
      if (resultado.ok) {
        try { digest = await enviarResumoDiario(admin, loja.userId) } catch { /* não derruba */ }
      }
      resultados.push({ loja: loja.userId, ...resultado, digest })
    } catch (e) {
      resultados.push({ loja: loja.userId, ok: false, erro: e instanceof Error ? e.message : 'erro' })
    }
  }

  return NextResponse.json({ ok: true, lojas: lojas.length, resultados })
}
