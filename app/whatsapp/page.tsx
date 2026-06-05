import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import WhatsAppClient from './WhatsAppClient'

export const metadata: Metadata = { title: 'WhatsApp — Zivo' }

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: contatos } = await supabase
    .from('whatsapp_contatos')
    .select('*')
    .eq('user_id', user.id)
    .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })

  return (
    <WhatsAppClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialContatos={contatos ?? []}
    />
  )
}
