import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

async function evo(method: string, path: string) {
  if (!BASE_URL || !API_KEY || !INSTANCE) throw new Error('Evolution API não configurada')
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  // Ignora erros de logout (instância pode já estar desconectada)
  if (!res.ok && method !== 'DELETE') throw new Error(`Evolution ${res.status}: ${await res.text()}`)
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
    // 1. Força logout da sessão atual (ignora erro se já desconectado)
    await evo('DELETE', `/instance/logout/${INSTANCE}`)

    // Aguarda 1s para a instância resetar
    await new Promise(r => setTimeout(r, 1000))

    // 2. Busca QR code novo
    const connect = await evo('GET', `/instance/connect/${INSTANCE}`)
    const qrcode = connect?.qrcode?.base64 ?? connect?.base64 ?? null

    if (!qrcode) {
      return NextResponse.json({ ok: false, error: 'QR code não retornado. Tente novamente em alguns segundos.' })
    }

    return NextResponse.json({ ok: true, qrcode })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 200 },
    )
  }
}
