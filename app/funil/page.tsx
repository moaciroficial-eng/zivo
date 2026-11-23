import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import FunilClient from './FunilClient'

export const metadata: Metadata = { title: 'Funil — Terny' }

export default async function FunilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: qualificacoes }, { data: contatos }, { data: vendas }] = await Promise.all([
    supabase.from('whatsapp_qualificacao')
      .select('id, contato_id, status, origem, iniciado_at, fotos_enviadas')
      .eq('user_id', user.id).order('iniciado_at', { ascending: false }),
    supabase.from('whatsapp_contatos').select('id, cliente_id').eq('user_id', user.id),
    supabase.from('vendas').select('cliente_id').eq('user_id', user.id).not('cliente_id', 'is', null),
  ])

  const clientePorContato: Record<string, string> = {}
  for (const c of (contatos ?? []) as { id: string; cliente_id: string | null }[]) {
    if (c.cliente_id) clientePorContato[c.id] = c.cliente_id
  }
  const clientesComVenda = [...new Set((vendas ?? []).map(v => v.cliente_id as string))]

  return (
    <FunilClient
      qualificacoes={qualificacoes ?? []}
      clientePorContato={clientePorContato}
      clientesComVenda={clientesComVenda}
    />
  )
}
