import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import RespostasProntasClient from './RespostasProntasClient'

export const metadata: Metadata = { title: 'Respostas prontas — Terny' }

export default async function RespostasProntasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: respostas } = await supabase
    .from('respostas_prontas')
    .select('id, titulo, atalho, texto, botoes')
    .order('titulo')

  return (
    <RespostasProntasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialRespostas={respostas ?? []}
    />
  )
}
