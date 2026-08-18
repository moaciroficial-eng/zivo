import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecebimentoClient from './RecebimentoClient'

export default async function RecebimentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('id, nome, marca, nfe_grupo_id, created_at')
    .eq('user_id', user.id)
    .eq('status', 'aguardando_recebimento')
    .not('nfe_grupo_id', 'is', null)
    .order('created_at', { ascending: false })

  /* Notas já conferidas (últimos 45 dias) — pra poder "avisar novidades" depois */
  const desde = new Date(Date.now() - 45 * 86400000).toISOString()
  const { data: recebidos } = await supabase
    .from('estoque')
    .select('id, nome, marca, nfe_grupo_id, created_at')
    .eq('user_id', user.id)
    .neq('status', 'aguardando_recebimento')
    .not('nfe_grupo_id', 'is', null)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <RecebimentoClient
      user={{ id: user.id, email: user.email ?? '' }}
      produtosPendentes={produtos ?? []}
      recebidosRecentes={recebidos ?? []}
    />
  )
}
