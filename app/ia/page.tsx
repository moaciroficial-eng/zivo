import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import IAClient from './IAClient'

export default async function IAPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sugestoes }, { data: agentes }, { data: logs }] = await Promise.all([
    supabase.from('agente_sugestoes').select('*').eq('user_id', user.id)
      .eq('status', 'pendente').order('prioridade', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('agentes').select('*').eq('user_id', user.id).order('tipo'),
    supabase.from('agente_logs').select('*, agentes(nome,tipo)').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(30),
  ])

  return <IAClient sugestoes={sugestoes ?? []} agentes={agentes ?? []} logs={logs ?? []} userId={user.id} />
}
