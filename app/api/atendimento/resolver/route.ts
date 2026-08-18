import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Marca uma pendência de atendimento como respondida (some da fila do dashboard).
   Aceita id (uma) ou contatoId (todas as pendentes daquele cliente). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { id, contatoId } = await request.json() as { id?: string; contatoId?: string }

  let q = supabase.from('atendimento_escalacoes')
    .update({ status: 'respondida', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'pendente')

  if (id) q = q.eq('id', id)
  else if (contatoId) q = q.eq('contato_id', contatoId)
  else return NextResponse.json({ ok: false, erro: 'sem id/contatoId' }, { status: 400 })

  const { error } = await q
  if (error) return NextResponse.json({ ok: false }, { status: 500 })
  return NextResponse.json({ ok: true })
}
