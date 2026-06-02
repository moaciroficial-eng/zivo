import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CondicionalClient from './CondicionalClient'

export default async function CondicionalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'em_condicional')
    .order('condicional_desde', { ascending: true })

  return (
    <CondicionalClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialProdutos={produtos ?? []}
    />
  )
}
