import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })

  const contatoId = request.nextUrl.searchParams.get('contatoId')
  if (!contatoId) return NextResponse.json({ erro: 'contatoId obrigatório' }, { status: 400 })

  /* Verifica que o contato pertence ao usuário */
  const { data: contato } = await supabase
    .from('whatsapp_contatos').select('id').eq('id', contatoId).eq('user_id', user.id).maybeSingle()
  if (!contato) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 })

  /* Apaga mensagens primeiro (FK) e depois o contato */
  await supabase.from('whatsapp_mensagens').delete().eq('contato_id', contatoId)
  await supabase.from('agente_conversa_estado').delete().eq('contato_id', contatoId)
  await supabase.from('whatsapp_contatos').delete().eq('id', contatoId)

  return NextResponse.json({ ok: true })
}
