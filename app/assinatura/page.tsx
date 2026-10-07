import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { garantirAssinatura, resumoAssinatura } from '@/lib/assinatura'
import AssinaturaClient from './AssinaturaClient'

export const metadata: Metadata = { title: 'Assinatura — Terny' }

export default async function AssinaturaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const a = await garantirAssinatura(admin, user.id)
  const resumo = resumoAssinatura(a)

  return <AssinaturaClient planoAtual={a.plano} status={a.status} resumo={resumo} />
}
