import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const INSTANCE = process.env.ZAPI_INSTANCE_ID
const TOKEN    = process.env.ZAPI_TOKEN
const BASE     = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}`

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  if (!INSTANCE || !TOKEN) {
    return NextResponse.json({ connected: false, error: 'Z-API não configurada' })
  }

  try {
    const clientToken = (process.env.ZAPI_CLIENT_TOKEN ?? TOKEN!).replace(/^﻿/, '').trim()
    const res  = await fetch(`${BASE}/status`, { cache: 'no-store', headers: { 'Client-Token': clientToken } })
    const data = await res.json()
    const connected = data?.connected === true
    return NextResponse.json({ connected, qrcode: null, phone: data?.phone ?? null })
  } catch (err) {
    return NextResponse.json({ connected: false, error: err instanceof Error ? err.message : 'Erro Z-API' })
  }
}
