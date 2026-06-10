import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function evo(method: string, path: string) {
  if (!BASE_URL || !API_KEY || !INSTANCE) throw new Error('Evolution API não configurada')
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
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
    // 1. Logout para limpar sessão corrompida (ignora erro)
    await evo('DELETE', `/instance/logout/${INSTANCE}`)
    await wait(1500)

    // 2. Restart da instância para sair do estado "connecting" travado
    await evo('PUT', `/instance/restart/${INSTANCE}`)
    await wait(2000)

    // 3. Busca QR code
    const connect = await evo('GET', `/instance/connect/${INSTANCE}`)

    // Evolution API v2 retorna diretamente base64, v1 retorna dentro de qrcode
    const qrcode = connect?.base64 ?? connect?.qrcode?.base64 ?? null

    // Se ainda não gerou (count:0), tenta mais uma vez após espera
    if (!qrcode) {
      await wait(2000)
      const retry = await evo('GET', `/instance/connect/${INSTANCE}`)
      const qrRetry = retry?.base64 ?? retry?.qrcode?.base64 ?? null
      if (!qrRetry) {
        return NextResponse.json({
          ok: false,
          error: 'QR code ainda não gerado. Aguarde alguns segundos e tente novamente.',
          raw: retry,
        })
      }
      return NextResponse.json({ ok: true, qrcode: qrRetry })
    }

    return NextResponse.json({ ok: true, qrcode })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 200 },
    )
  }
}
