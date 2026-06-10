import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function evo(method: string, path: string, body?: unknown) {
  if (!BASE_URL || !API_KEY || !INSTANCE) throw new Error('Evolution API não configurada')
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  try { return await res.json() } catch { return {} }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    // 1. Deleta a instância travada
    await evo('DELETE', `/instance/delete/${INSTANCE}`)
    await wait(2000)

    // 2. Recria a instância limpa
    await evo('POST', '/instance/create', {
      instanceName: INSTANCE,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    })
    await wait(2000)

    // 3. Busca o QR code
    const connect = await evo('GET', `/instance/connect/${INSTANCE}`)
    const qrcode = connect?.base64 ?? connect?.qrcode?.base64 ?? null

    if (!qrcode) {
      // Tenta mais uma vez após espera extra
      await wait(2000)
      const retry = await evo('GET', `/instance/connect/${INSTANCE}`)
      const qrRetry = retry?.base64 ?? retry?.qrcode?.base64 ?? null
      return NextResponse.json({
        ok: !!qrRetry,
        qrcode: qrRetry,
        error: qrRetry ? undefined : 'QR não retornado após recriar. Tente novamente.',
        raw: qrRetry ? undefined : retry,
      })
    }

    return NextResponse.json({ ok: true, qrcode })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 200 },
    )
  }
}
