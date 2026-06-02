import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

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
    { data: metaRow },
  ] = await Promise.all([
    supabase.from('vendas').select('valor').eq('user_id', user.id),
    supabase.from('vendas').select('valor').eq('user_id', user.id)
      .gte('data_venda', mesStart).lt('data_venda', nextMonth),
    supabase.from('metas').select('*').eq('user_id', user.id).eq('mes', mes).maybeSingle(),
  ])

  const totalReceita = (todasVendas ?? []).reduce((s, v) => s + Number(v.valor), 0)
  const vendidoMes   = (vendasMes   ?? []).reduce((s, v) => s + Number(v.valor), 0)
  const totalVendas  = todasVendas?.length ?? 0

  return (
    <DashboardClient
      user={{ id: user.id, email: user.email ?? '' }}
      mes={mes}
      totalReceita={totalReceita}
      totalVendas={totalVendas}
      vendidoMes={vendidoMes}
      metaInicial={metaRow ?? null}
    />
  )
}
