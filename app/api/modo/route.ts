import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getModo } from '@/lib/modo'

/* Estado atual do modo + se o dono já definiu um PIN. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ modo: 'dono', temPin: false })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('loja_config').select('modo_pin_hash').eq('user_id', user.id).maybeSingle()

  const modo = await getModo()
  return NextResponse.json({ modo, temPin: !!data?.modo_pin_hash })
}
