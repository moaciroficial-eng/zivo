import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecebimentoClient from './RecebimentoClient'

export default async function RecebimentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('id, nome, marca, nfe_grupo_id, created_at')
    .eq('user_id', user.id)
    .eq('status', 'aguardando_recebimento')
    .not('nfe_grupo_id', 'is', null)
    .order('created_at', { ascending: false })

  return (
    <RecebimentoClient
      user={{ id: user.id, email: user.email ?? '' }}
      produtosPendentes={produtos ?? []}
    />
  )
}
