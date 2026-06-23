import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InteligenciaClient from './InteligenciaClient'

export default async function InteligenciaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sugestoes } = await supabase
    .from('agente_sugestoes')
    .select('*')
    .eq('user_id', user.id)
    .order('prioridade', { ascending: true })
    .order('created_at', { ascending: false })

  return <InteligenciaClient sugestoes={sugestoes ?? []} userId={user.id} />
}
