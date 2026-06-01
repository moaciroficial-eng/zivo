import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VendasClient from './VendasClient'

export default async function VendasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: vendas }, { data: clientes }, { data: estoque }] = await Promise.all([
    supabase.from('vendas').select('*').order('data_venda', { ascending: false }),
    supabase.from('clientes').select('id, nome').order('nome'),
    supabase.from('estoque').select('id, nome, marca, preco_venda, preco_custo, codigo_barras, status')
      .not('status', 'eq', 'vendido').order('nome'),
  ])

  return (
    <VendasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialVendas={vendas ?? []}
      clientes={clientes ?? []}
      estoqueItems={estoque ?? []}
    />
  )
}
