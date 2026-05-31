import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MarcasClient from './MarcasClient'

export default async function MarcasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: marcas } = await supabase
    .from('marcas')
    .select('id, nome, markup')
    .order('nome')

  return (
    <MarcasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialMarcas={marcas ?? []}
    />
  )
}
