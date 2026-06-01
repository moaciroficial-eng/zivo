import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConferenciaClient from './ConferenciaClient'

export default async function ConferenciaPage({
  params,
}: {
  params: Promise<{ grupoId: string }>
}) {
  const { grupoId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('*')
    .eq('nfe_grupo_id', grupoId)
    .eq('user_id', user.id)
    .order('nome')

  if (!produtos?.length) notFound()

  return (
    <ConferenciaClient
      user={{ id: user.id, email: user.email ?? '' }}
      grupoId={grupoId}
      produtos={produtos}
    />
  )
}
