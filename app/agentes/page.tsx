import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AgentesClient from './AgentesClient'

export default async function AgentesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: agentes }, { data: logs }, { data: insights }] = await Promise.all([
    supabase.from('agentes').select('*').eq('user_id', user.id).order('tipo'),
    supabase.from('agente_logs').select('*, agentes(nome,tipo)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('contato_insights').select('*, whatsapp_contatos(nome,phone,foto_url)').eq('user_id', user.id).order('ultima_analise', { ascending: false }).limit(30),
  ])

  return <AgentesClient agentes={agentes ?? []} logs={logs ?? []} insights={insights ?? []} />
}
