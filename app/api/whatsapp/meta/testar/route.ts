import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/* Valida as credenciais da Meta Cloud API consultando o Graph:
   GET /{phone_number_id}?fields=verified_name,display_phone_number
   Retorna o número/nome conectado se o token e o id estiverem certos. */

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { phoneNumberId, accessToken } = await request.json() as {
    phoneNumberId?: string; accessToken?: string
  }
  if (!phoneNumberId?.trim() || !accessToken?.trim()) {
    return NextResponse.json({ ok: false, erro: 'Preencha o Phone Number ID e o token.' })
  }

  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId.trim()}?fields=verified_name,display_phone_number`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = data?.error?.message || 'Credenciais inválidas ou sem permissão.'
      return NextResponse.json({ ok: false, erro: msg })
    }

    return NextResponse.json({
      ok: true,
      phone: data?.display_phone_number ?? null,
      nome: data?.verified_name ?? null,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'Falha ao contatar a Meta.' })
  }
}
