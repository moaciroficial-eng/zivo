import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import IAClient from './IAClient'
import { gerarOportunidades, limparNomeProduto } from '@/lib/inteligencia/oportunidades'

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
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
    gerarOportunidades(supabase, user.id, { limite: 40 }).catch(() => []),
  ])

  /* Feed de oportunidades do MOTOR, já com copy pronta e editável */
  const saud = saudacaoBR()
  const oportunidades = oportunidadesRaw.map(o => {
    const primeiro = o.clienteNome.split(' ')[0]
    const nomeLimpo = limparNomeProduto(o.produtoNome, o.marca)
    const marcaTxt = o.marca ? ` da ${o.marca}` : ''
    return {
      clienteId: o.clienteId, clienteNome: o.clienteNome, telefone: o.telefone,
      produtoNome: nomeLimpo, marca: o.marca, tamanho: o.tamanho, motivo: o.motivo, tipo: o.tipo,
      copy: `${saud} ${primeiro}! Chegou ${nomeLimpo}${marcaTxt} aqui na loja no ${o.tamanho} e achei muito a sua cara. Passa pra ver ou me fala que te mando as fotos!`,
    }
  })

  return <IAClient sugestoes={sugestoes ?? []} agentes={agentes ?? []} logs={logs ?? []} oportunidades={oportunidades} userId={user.id} />
}
