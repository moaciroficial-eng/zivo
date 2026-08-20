import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getModo } from '@/lib/modo'
import CaixaClient from './CaixaClient'

export const metadata: Metadata = { title: 'Levantar Caixa — Zivo' }

export default async function CaixaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /* Financeiro é oculto no modo funcionária */
  const modo = await getModo()
  if (modo === 'funcionaria') redirect('/dashboard')

  return <CaixaClient />
}
