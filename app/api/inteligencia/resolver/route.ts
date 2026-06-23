import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ erro: 'params obrigatórios' }, { status: 400 })

  await supabase.from('agente_sugestoes')
    .update({ status, resolvida_em: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
