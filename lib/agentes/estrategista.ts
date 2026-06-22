import { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function planoSemana(admin: SupabaseClient, userId: string): Promise<string> {
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  const inicio7d   = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: vendasMes },
    { data: vendas7d },
    { data: meta },
    { data: clientesInativos },
  ] = await Promise.all([
    admin.from('vendas').select('total, status').eq('user_id', userId).gte('created_at', inicioMes),
    admin.from('vendas').select('total, status').eq('user_id', userId).gte('created_at', inicio7d),
    admin.from('metas').select('*').eq('user_id', userId).eq('mes', agora.getMonth() + 1).eq('ano', agora.getFullYear()).maybeSingle(),
    admin.from('clientes').select('id, nome, telefone')
      .eq('user_id', userId)
      .lt('updated_at', new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(10),
  ])

  const okMes = (vendasMes ?? []).filter((v: { status: string }) => v.status !== 'cancelada')
  const ok7d  = (vendas7d ?? []).filter((v: { status: string }) => v.status !== 'cancelada')
  const fatMes = okMes.reduce((s: number, v: { total: number }) => s + (Number(v.total) || 0), 0)
  const fat7d  = ok7d.reduce((s: number, v: { total: number }) => s + (Number(v.total) || 0), 0)
  const metaFat = meta?.meta_faturamento ? Number(meta.meta_faturamento) : null
  const faltaMeta = metaFat ? Math.max(0, metaFat - fatMes) : null
  const diaAtual = agora.getDate()
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()
  const diasRestantes = diasNoMes - diaAtual

  const contexto = `
Faturamento do mês até hoje: R$ ${fatMes.toFixed(2)} (${okMes.length} vendas)
Últimos 7 dias: R$ ${fat7d.toFixed(2)} (${ok7d.length} vendas)
${metaFat ? `Meta do mês: R$ ${metaFat.toFixed(2)} | Falta: R$ ${faltaMeta?.toFixed(2)} | Dias restantes: ${diasRestantes}` : 'Sem meta definida para o mês'}
Clientes inativos (sem compra há +30 dias): ${(clientesInativos ?? []).length}
`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Você é o estrategista do Zivo. Crie um plano de ação para essa semana para uma loja de roupas.

DADOS:
${contexto}

Seja objetivo e prático. Formato:
🎯 *Plano da Semana*

📊 Situação: [1 linha resumindo onde está a loja]
${metaFat && faltaMeta && faltaMeta > 0 ? `⚡ Para bater a meta precisa de R$ ${(faltaMeta / Math.max(diasRestantes / 7, 1)).toFixed(2)} essa semana` : ''}

✅ 3 ações para essa semana:
1. [ação concreta e específica]
2. [ação concreta e específica]
3. [ação concreta e específica]

💡 Foco principal: [1 prioridade absoluta]`,
    }],
  })

  return (res.content[0] as { text: string }).text.trim()
}

export async function analisarCrescimento(admin: SupabaseClient, userId: string): Promise<string> {
  const agora = new Date()
  const meses: { mes: string; fat: number; qtd: number }[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const inicio = d.toISOString()
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString()
    const { data } = await admin.from('vendas').select('total, status')
      .eq('user_id', userId).gte('created_at', inicio).lte('created_at', fim)
    const ok = (data ?? []).filter((v: { status: string }) => v.status !== 'cancelada')
    const fat = ok.reduce((s: number, v: { total: number }) => s + (Number(v.total) || 0), 0)
    meses.push({ mes: d.toLocaleString('pt-BR', { month: 'short' }), fat, qtd: ok.length })
  }

  const historico = meses.map(m => `${m.mes}: R$ ${m.fat.toFixed(0)} (${m.qtd} vendas)`).join('\n')
  const tendencia = meses[5].fat > meses[0].fat ? 'crescimento' : meses[5].fat < meses[0].fat ? 'queda' : 'estável'

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Analise a curva de crescimento desta loja de roupas nos últimos 6 meses.

HISTÓRICO:
${historico}

Tendência detectada: ${tendencia}

Seja direto e estratégico:
📈 *Análise de Crescimento (6 meses)*

${historico.split('\n').map(l => `• ${l}`).join('\n')}

Tendência: [análise da curva]
Ponto de virada: [se houve]
Projeção: [próximos 2 meses se continuar assim]
🎯 Recomendação: [o que fazer com base nessa curva]`,
    }],
  })

  return (res.content[0] as { text: string }).text.trim()
}
