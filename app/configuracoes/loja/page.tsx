import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import LojaConfigClient from './LojaConfigClient'

export const metadata: Metadata = { title: 'Configurações da Loja — Zivo' }

export default async function LojaConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: config } = await supabase
    .from('loja_config')
    .select('nome_loja, horario, endereco, info_extra, owner_phone, ativo, proativo_ativo, desconto_aniversario')
    .eq('user_id', user.id)
    .maybeSingle()

  return <LojaConfigClient user={{ id: user.id, email: user.email ?? '' }} config={config ?? null} />
}
