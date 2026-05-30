import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EstoqueFormPage from '../../_components/EstoqueFormPage'

type SP = Promise<Record<string, string | undefined>>

export default async function EditarEstoquePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SP
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: produto } = await supabase
    .from('estoque')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!produto) notFound()

  return <EstoqueFormPage user={{ id: user.id, email: user.email ?? '' }} produto={produto} scanParams={sp} />
}
