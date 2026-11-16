import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import DisparoResultadoClient from './DisparoResultadoClient'

export const metadata: Metadata = { title: 'Resultado do disparo — Terny' }

export default async function DisparoResultadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <DisparoResultadoClient id={id} />
}
