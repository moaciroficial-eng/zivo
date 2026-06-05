import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ClientesClient from './ClientesClient'

export const metadata: Metadata = { title: 'Clientes — Zivo' }

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: clientes } = await supabase
    .from('clientes')
    .select('*')
    .eq('user_id', user.id)
    .order('nome')

  return (
    <ClientesClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialClientes={clientes ?? []}
    />
  )
}
