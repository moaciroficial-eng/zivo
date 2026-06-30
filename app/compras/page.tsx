import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ComprasClient from './ComprasClient'

export default async function ComprasPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('estoque')
    .select('marca')
    .eq('user_id', user.id)
    .not('marca', 'is', null)

  const marcas = [...new Set((rows ?? []).map(r => r.marca as string).filter(Boolean))].sort()

  return <ComprasClient marcas={marcas} />
}
