import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CampanhasClient from './CampanhasClient'

export default async function CampanhasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: campanhas } = await supabase
    .from('campanhas').select('id, nome, objetivo, copy_whatsapp, status, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)

  return <CampanhasClient campanhas={campanhas ?? []} />
}
