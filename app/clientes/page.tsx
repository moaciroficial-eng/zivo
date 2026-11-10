import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ClientesClient from './ClientesClient'

export const metadata: Metadata = { title: 'Clientes — Terny' }

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: clientes }, { data: lojaConfig }, { data: vendas }] = await Promise.all([
    supabase.from('clientes').select('*').eq('user_id', user.id).order('nome'),
    supabase.from('loja_config').select('vende_tenis, vende_feminino').eq('user_id', user.id).maybeSingle(),
    supabase.from('vendas').select('cliente_id, valor, data_venda').eq('user_id', user.id).not('cliente_id', 'is', null),
  ])

  /* Última compra + total gasto por cliente — pra mostrar na lista e filtrar
     "sumidos há +60 dias" sem precisar abrir o histórico de cada um. */
  const comprasPorCliente: Record<string, { ultima_compra: string | null; total_gasto: number }> = {}
  for (const v of (vendas ?? []) as { cliente_id: string | null; valor: number; data_venda: string }[]) {
    if (!v.cliente_id) continue
    const atual = comprasPorCliente[v.cliente_id] ?? { ultima_compra: null, total_gasto: 0 }
    atual.total_gasto += Number(v.valor) || 0
    if (!atual.ultima_compra || v.data_venda > atual.ultima_compra) atual.ultima_compra = v.data_venda
    comprasPorCliente[v.cliente_id] = atual
  }

  return (
    <ClientesClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialClientes={clientes ?? []}
      lojaConfig={lojaConfig ?? null}
      comprasPorCliente={comprasPorCliente}
    />
  )
}
