import { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function situacaoFinanceira(admin: SupabaseClient, userId: string): Promise<string> {
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  const inicioMesAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString()
  const fimMesAnt = new Date(agora.getFullYear(), agora.getMonth(), 0).toISOString()
  const diaAtual = agora.getDate()
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()

  const [
    { data: vendasMes },
    { data: vendasMesAnt },
    { data: meta },
  ] = await Promise.all([
    admin.from('vendas').select('total, status, created_at').eq('user_id', userId).gte('created_at', inicioMes),
    admin.from('vendas').select('total, status').eq('user_id', userId).gte('created_at', inicioMesAnt).lt('created_at', fimMesAnt),
    admin.from('metas').select('*').eq('user_id', userId).eq('mes', agora.getMonth() + 1).eq('ano', agora.getFullYear()).maybeSingle(),
  ])

  const ok = (vendasMes ?? []).filter((v: { status: string }) => v.status !== 'cancelada')
  const okAnt = (vendasMesAnt ?? []).filter((v: { status: string }) => v.status !== 'cancelada')
  const fatAtual = ok.reduce((s: number, v: { total: number }) => s + (Number(v.total) || 0), 0)
  const fatAnt = okAnt.reduce((s: number, v: { total: number }) => s + (Number(v.total) || 0), 0)

  const ritmoDiario = diaAtual > 0 ? fatAtual / diaAtual : 0
  const projecaoMes = ritmoDiario * diasNoMes
  const metaFat = meta?.meta_faturamento ? Number(meta.meta_faturamento) : null
  const progressoMeta = metaFat ? (fatAtual / metaFat * 100).toFixed(0) : null
  const faltaMeta = metaFat ? Math.max(0, metaFat - fatAtual) : null
  const diasRestantes = diasNoMes - diaAtual
  const necessarioPorDia = faltaMeta && diasRestantes > 0 ? (faltaMeta / diasRestantes).toFixed(2) : null

  const partes = [
    `💰 *Financeiro — ${agora.toLocaleString('pt-BR', { month: 'long' })}*`,
    '',
    `📅 Dia ${diaAtual}/${diasNoMes}`,
    `Faturado: *R$ ${fatAtual.toFixed(2)}* (${ok.length} vendas)`,
    `Mês anterior: R$ ${fatAnt.toFixed(2)}`,
    fatAnt > 0 ? `Variação: ${fatAtual >= fatAnt ? '+' : ''}${((fatAtual - fatAnt) / fatAnt * 100).toFixed(0)}%` : '',
    `Projeção para fechar o mês: *R$ ${projecaoMes.toFixed(2)}*`,
    '',
  ]

  if (metaFat) {
    partes.push(`🎯 Meta: R$ ${metaFat.toFixed(2)}`)
    partes.push(`Progresso: ${progressoMeta}%`)
    if (faltaMeta && faltaMeta > 0) {
      partes.push(`Faltam: R$ ${faltaMeta.toFixed(2)} em ${diasRestantes} dias`)
      partes.push(`Precisa de: R$ ${necessarioPorDia}/dia`)
    } else {
      partes.push(`✅ Meta atingida!`)
    }
  } else {
    partes.push(`💡 Dica: defina uma meta para esse mês. Ex: "meta de R$5000 esse mês"`)
  }

  return partes.filter(p => p !== '').join('\n')
}

export async function definirMeta(
  admin: SupabaseClient,
  userId: string,
  metaFaturamento: number,
  mes?: number,
  ano?: number
): Promise<string> {
  const agora = new Date()
  const m = mes ?? agora.getMonth() + 1
  const a = ano ?? agora.getFullYear()

  await admin.from('metas').upsert(
    { user_id: userId, mes: m, ano: a, meta_faturamento: metaFaturamento, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,mes,ano' }
  )

  const nomeMes = new Date(a, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })
  return `🎯 Meta definida!\n\n*${nomeMes}/${a}*: R$ ${metaFaturamento.toFixed(2)}\n\nVou acompanhar seu progresso. Manda "como tá o financeiro?" a qualquer momento pra checar.`
}
