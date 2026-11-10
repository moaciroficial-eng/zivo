import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import IAClient from './IAClient'
import { gerarOportunidades } from '@/lib/inteligencia/oportunidades'
import { construirCopyOportunidadesComIA } from '@/lib/inteligencia/copy'

export default async function IAPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sugestoes }, { data: agentes }, { data: logs }, oportunidadesRaw] = await Promise.all([
    supabase.from('agente_sugestoes').select('*').eq('user_id', user.id)
      .eq('status', 'pendente').order('prioridade', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('agentes').select('*').eq('user_id', user.id).order('tipo'),
    supabase.from('agente_logs').select('*, agentes(nome,tipo)').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(30),
    gerarOportunidades(supabase, user.id, { limite: 40 }).catch(() => []),
  ])

  /* Feed de oportunidades do MOTOR, já com copy pronta e editável (helper
     compartilhado com o bloco "Quem chamar hoje" do Painel). Usa o nome
     amigável (IA, cacheado por produto) quando disponível. */
  const oportunidades = await construirCopyOportunidadesComIA(supabase, oportunidadesRaw)

  return <IAClient sugestoes={sugestoes ?? []} agentes={agentes ?? []} logs={logs ?? []} oportunidades={oportunidades} userId={user.id} />
}
