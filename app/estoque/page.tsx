import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EstoqueClient from './EstoqueClient'

export default async function EstoquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('*')
    .order('nome')

  return (
    <EstoqueClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialProdutos={produtos ?? []}
    />
  )
}
