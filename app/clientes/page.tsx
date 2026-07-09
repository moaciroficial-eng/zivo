import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ClientesClient from './ClientesClient'

export const metadata: Metadata = { title: 'Clientes — Zivo' }

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: clientes }, { data: lojaConfig }] = await Promise.all([
    supabase.from('clientes').select('*').eq('user_id', user.id).order('nome'),
    supabase.from('loja_config').select('vende_tenis, vende_feminino').eq('user_id', user.id).maybeSingle(),
  ])

  return (
    <ClientesClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialClientes={clientes ?? []}
      lojaConfig={lojaConfig ?? null}
    />
  )
}
