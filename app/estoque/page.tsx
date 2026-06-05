import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EstoqueClient from './EstoqueClient'

export const metadata: Metadata = { title: 'Estoque — Zivo' }

export default async function EstoquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: produtos }, { data: fotos }] = await Promise.all([
    supabase.from('estoque').select('*').order('nome'),
    supabase.from('biblioteca_fotos').select('url, estoque_ids'),
  ])

  // Mapa produtoId → url da foto
  const fotoMap: Record<string, string> = {}
  for (const f of fotos ?? []) {
    for (const id of f.estoque_ids ?? []) {
      if (!fotoMap[id]) fotoMap[id] = f.url
    }
  }

  return (
    <EstoqueClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialProdutos={produtos ?? []}
      fotoMap={fotoMap}
    />
  )
}
