import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import IAClient from './IAClient'
import { gerarOportunidades } from '@/lib/inteligencia/oportunidades'
import { construirCopyOportunidadesComIA, construirCopyOportunidades } from '@/lib/inteligencia/copy'

// teto de segurança: nunca espera além disso pela IA (nome amigável) ou pela
// consulta — cai no fallback em vez de travar a página.
function comTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }).catch(() => { clearTimeout(t); resolve(fallback) })
  })
}

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
    comTimeout(gerarOportunidades(supabase, user.id, { limite: 40 }), 3000, []),
  ])

  /* Feed de oportunidades do MOTOR, já com copy pronta e editável (helper
     compartilhado com o bloco "Quem chamar hoje" do Painel). Usa o nome
     amigável (IA, cacheado por produto) quando disponível. */
  const oportunidades = await comTimeout(
    construirCopyOportunidadesComIA(supabase, oportunidadesRaw),
    4000,
    construirCopyOportunidades(oportunidadesRaw),
  )

  return <IAClient sugestoes={sugestoes ?? []} agentes={agentes ?? []} logs={logs ?? []} oportunidades={oportunidades} userId={user.id} />
}
