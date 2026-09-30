import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SaudeFiscalClient, { type ProdutoFiscal } from './SaudeFiscalClient'

export const metadata: Metadata = { title: 'Saúde fiscal dos produtos — Terny' }

export default async function SaudeFiscalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: produtos } = await supabase
    .from('estoque')
    .select('id, nome, marca, categoria, ncm, status')
    .eq('user_id', user.id)
    .not('status', 'eq', 'vendido')
    .order('categoria', { ascending: true })
    .order('nome', { ascending: true })

  return <SaudeFiscalClient user={{ id: user.id }} produtos={(produtos ?? []) as ProdutoFiscal[]} />
}
