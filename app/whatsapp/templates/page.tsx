import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import TemplatesClient from './TemplatesClient'

export const metadata: Metadata = { title: 'WhatsApp · Templates — Terny' }

export default async function WhatsAppTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <TemplatesClient />
}
