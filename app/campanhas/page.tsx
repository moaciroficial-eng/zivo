import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CampanhasClient from './CampanhasClient'
import { proximasDatas } from '@/lib/datas-comemorativas'

export default async function CampanhasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: campanhas } = await supabase
    .from('campanhas').select('id, nome, objetivo, produto_marca, copy_whatsapp, status, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)

  const datas = proximasDatas(45)

  return <CampanhasClient campanhas={campanhas ?? []} datas={datas} />
}
