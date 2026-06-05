import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import BibliotecaClient from './BibliotecaClient'

export const metadata: Metadata = { title: 'Biblioteca — Zivo' }

export default async function BibliotecaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: fotos }, { data: estoque }] = await Promise.all([
    supabase.from('biblioteca_fotos').select('*').order('created_at', { ascending: false }),
    supabase.from('estoque').select('id, nome, marca, codigo_barras').order('nome'),
  ])

  return (
    <BibliotecaClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialFotos={fotos ?? []}
      estoqueItems={estoque ?? []}
    />
  )
}
