import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getModo, hashPin } from '@/lib/modo'

/* Define/troca o PIN do modo funcionária. Só permitido no modo dono (quem já
   está no modo restrito não pode trocar o PIN). Se já existe um PIN, exige o
   atual pra trocar. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  if ((await getModo()) !== 'dono') {
    return NextResponse.json({ ok: false, erro: 'Saia do modo funcionária para alterar o PIN.' }, { status: 403 })
  }

  const { pin, pinAtual } = await request.json() as { pin?: string; pinAtual?: string }
  if (!pin || !/^\d{4,8}$/.test(pin.trim())) {
    return NextResponse.json({ ok: false, erro: 'O PIN deve ter de 4 a 8 dígitos.' })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('loja_config').select('modo_pin_hash').eq('user_id', user.id).maybeSingle()

  if (data?.modo_pin_hash) {
    if (!pinAtual || hashPin(user.id, pinAtual) !== data.modo_pin_hash) {
      return NextResponse.json({ ok: false, erro: 'PIN atual incorreto.' }, { status: 403 })
    }
  }

  const { error } = await admin.from('loja_config')
    .upsert({ user_id: user.id, modo_pin_hash: hashPin(user.id, pin.trim()) }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
