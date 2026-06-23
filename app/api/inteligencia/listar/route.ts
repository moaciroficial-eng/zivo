import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data } = await supabase
    .from('agente_sugestoes')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pendente')
    .order('prioridade', { ascending: true })
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}
