import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { COOKIE_MODO, hashPin } from '@/lib/modo'

/* Sai do modo funcionária de volta ao modo dono — exige o PIN do dono. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { pin } = await request.json() as { pin?: string }
  if (!pin?.trim()) return NextResponse.json({ ok: false, erro: 'Digite o PIN.' })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('loja_config').select('modo_pin_hash').eq('user_id', user.id).maybeSingle()

  if (!data?.modo_pin_hash) {
    // Sem PIN configurado: não há trava — libera (dono ainda não protegeu)
    const store = await cookies()
    store.delete(COOKIE_MODO)
    return NextResponse.json({ ok: true })
  }

  if (hashPin(user.id, pin) !== data.modo_pin_hash) {
    return NextResponse.json({ ok: false, erro: 'PIN incorreto.' }, { status: 403 })
  }

  const store = await cookies()
  store.delete(COOKIE_MODO)
  return NextResponse.json({ ok: true })
}
