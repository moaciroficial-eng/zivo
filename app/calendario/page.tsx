import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import CalendarioClient from './CalendarioClient'

export const metadata: Metadata = { title: 'Calendário — Zivo' }

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [{ data: eventos }, { data: clientes }] = await Promise.all([
    supabase.from('eventos').select('*').order('data'),
    supabase.from('clientes').select('id, nome, data_nascimento, dia_pagamento').order('nome'),
  ])

  return (
    <CalendarioClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialEventos={eventos ?? []}
      clientes={clientes ?? []}
    />
  )
}
