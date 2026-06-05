import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas — Zivo' }

export default async function VendasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: vendas }, { data: clientes }, { data: estoque }, { data: caixaAtual }, { data: historicoCaixas }] = await Promise.all([
    supabase.from('vendas').select('*').eq('user_id', user.id).order('data_venda', { ascending: false }),
    supabase.from('clientes').select('id, nome').eq('user_id', user.id).order('nome'),
    supabase.from('estoque').select('id, nome, marca, preco_venda, preco_custo, codigo_barras, status')
      .eq('user_id', user.id).not('status', 'eq', 'vendido').order('nome'),
    supabase.from('caixas').select('*').eq('user_id', user.id).eq('status', 'aberto').maybeSingle(),
    supabase.from('caixas').select('*').eq('user_id', user.id).eq('status', 'fechado')
      .order('data_fechamento', { ascending: false }).limit(20),
  ])

  return (
    <VendasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialVendas={vendas ?? []}
      clientes={clientes ?? []}
      estoqueItems={estoque ?? []}
      caixaAtual={caixaAtual ?? null}
      historicoCaixas={historicoCaixas ?? []}
    />
  )
}
