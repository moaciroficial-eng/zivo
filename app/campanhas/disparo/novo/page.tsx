import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import DisparoNovoClient from './DisparoNovoClient'

export const metadata: Metadata = { title: 'Disparar template — Terny' }

export default async function DisparoNovoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <DisparoNovoClient />
}
