import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const BASE_URL  = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY   = process.env.EVOLUTION_API_KEY
const INSTANCE  = process.env.EVOLUTION_INSTANCE

async function evo(path: string) {
  if (!BASE_URL || !API_KEY || !INSTANCE) throw new Error('Evolution API não configurada')
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { apikey: API_KEY },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Evolution ${res.status}`)
  return res.json()
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    // Tenta pegar estado da conexão
    const state = await evo(`/instance/connectionState/${INSTANCE}`)
    const connected = state?.instance?.state === 'open' || state?.state === 'open'

    if (connected) {
      return NextResponse.json({ connected: true, qrcode: null })
    }

    // Desconectado — pede QR code
    const connect = await evo(`/instance/connect/${INSTANCE}`)
    const qrcode = connect?.base64 ?? connect?.qrcode?.base64 ?? null

    return NextResponse.json({ connected: false, qrcode })
  } catch (err) {
    return NextResponse.json(
      { connected: false, qrcode: null, error: err instanceof Error ? err.message : 'Servidor offline' },
      { status: 200 },
    )
  }
}
