import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Anexa uma observação ao cliente (nota do dono). É a "verdade máxima" que o
   motor de oportunidades e o atendimento leem — então anotar aqui ensina a IA. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { clienteId, texto } = await request.json()
  if (!clienteId || !String(texto ?? '').trim()) return NextResponse.json({ ok: false, erro: 'faltam dados' }, { status: 400 })
  const nota = String(texto).trim()

  const { data: cli } = await supabase.from('clientes').select('observacoes')
    .eq('id', clienteId).eq('user_id', user.id).maybeSingle()
  if (!cli) return NextResponse.json({ ok: false, erro: 'cliente não encontrado' }, { status: 404 })

  const atual = String(cli.observacoes ?? '').trim()
  /* não duplica se a nota já estiver lá */
  if (atual.toLowerCase().includes(nota.toLowerCase())) {
    return NextResponse.json({ ok: true, observacoes: atual })
  }
  const nova = atual ? `${atual}\n${nota}` : nota
  const { error } = await supabase.from('clientes').update({ observacoes: nova })
    .eq('id', clienteId).eq('user_id', user.id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, observacoes: nova })
}
