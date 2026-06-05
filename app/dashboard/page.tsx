import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export const metadata: Metadata = { title: 'Dashboard — Zivo' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const now     = new Date()
  const year    = now.getUTCFullYear()
  const month   = now.getUTCMonth() + 1
  const mes     = `${year}-${String(month).padStart(2, '0')}`
  const mesStart = `${mes}-01`
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const [
    { data: todasVendas },
    { data: vendasMes },
    { data: estoqueItems },
    { data: metaRow },
  ] = await Promise.all([
    supabase.from('vendas').select('valor').eq('user_id', user.id),
    supabase.from('vendas').select('valor, data_venda, produtos').eq('user_id', user.id)
      .gte('data_venda', mesStart).lt('data_venda', nextMonth),
    supabase.from('estoque').select('nome, marca, preco_custo').eq('user_id', user.id),
    supabase.from('metas').select('*').eq('user_id', user.id).eq('mes', mes).maybeSingle(),
  ])

  const totalReceita = (todasVendas ?? []).reduce((s, v) => s + Number(v.valor), 0)
  const vendidoMes   = (vendasMes   ?? []).reduce((s, v) => s + Number(v.valor), 0)
  const totalVendas  = todasVendas?.length ?? 0

  // Mapa de custo por nome do produto (nome exibido no formulário de venda)
  const custoPorNome: Record<string, number> = {}
  for (const item of estoqueItems ?? []) {
    if (item.preco_custo == null) continue
    const nomeExibido = item.nome + (item.marca ? ` (${item.marca})` : '')
    custoPorNome[nomeExibido] = item.preco_custo
    custoPorNome[item.nome]   = item.preco_custo
  }

  // Lucro do mês: usa preco_custo salvo na venda ou faz lookup no estoque pelo nome
  type ProdVenda = { nome?: string; qtd?: number; preco_unitario?: number; desconto?: number; preco_custo?: number }
  let custoProdutosMes = 0
  let itensComCusto = 0
  let itensSemCusto = 0
  for (const v of vendasMes ?? []) {
    const prods = (Array.isArray(v.produtos) ? v.produtos : []) as ProdVenda[]
    for (const p of prods) {
      const qtd = p.qtd ?? 1
      const custo = p.preco_custo ?? (p.nome ? custoPorNome[p.nome] : undefined)
      if (custo != null) {
        custoProdutosMes += custo * qtd
        itensComCusto++
      } else {
        itensSemCusto++
      }
    }
  }
  const lucroMes = itensComCusto > 0 ? vendidoMes - custoProdutosMes : null

  // Aggregate daily sales for chart
  const dailyMap: Record<number, number> = {}
  for (const v of vendasMes ?? []) {
    const day = parseInt((v.data_venda as string).slice(8, 10))
    dailyMap[day] = (dailyMap[day] ?? 0) + Number(v.valor)
  }
  const vendasPorDia = Object.entries(dailyMap).map(([day, valor]) => ({ day: Number(day), valor }))

  return (
    <DashboardClient
      user={{ id: user.id, email: user.email ?? '' }}
      mes={mes}
      totalReceita={totalReceita}
      totalVendas={totalVendas}
      vendidoMes={vendidoMes}
      lucroMes={lucroMes}
      lucroParcial={itensSemCusto > 0}
      metaInicial={metaRow ?? null}
      vendasPorDia={vendasPorDia}
    />
  )
}
