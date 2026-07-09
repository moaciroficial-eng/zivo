import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MarcasClient from './MarcasClient'

export const metadata: Metadata = { title: 'Marcas — Zivo' }

export default async function MarcasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: marcas }, { data: estoqueRows }] = await Promise.all([
    supabase.from('marcas').select('id, nome, markup').order('nome'),
    supabase.from('estoque').select('marca').eq('user_id', user.id).not('marca', 'is', null),
  ])

  const marcasEstoque = [...new Set((estoqueRows ?? []).map(r => r.marca as string).filter(Boolean))].sort()

  return (
    <MarcasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialMarcas={marcas ?? []}
      marcasEstoque={marcasEstoque}
    />
  )
}
