import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_MODO } from '@/lib/modo'

/* Entra no modo funcionária — não precisa de PIN (é uma restrição, qualquer um
   pode ativar). Sair de volta ao modo dono é que exige o PIN. */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const store = await cookies()
  store.set(COOKIE_MODO, 'funcionaria', {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 60, // 60 dias
  })
  return NextResponse.json({ ok: true })
}
