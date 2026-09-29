import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { marcarComoLida } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { NextRequest, NextResponse } from 'next/server'

/* Marca a última mensagem recebida do contato como LIDA (✓✓ azul pro cliente).
   Chamado quando o dono abre a conversa. Best-effort. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let contatoId: string
  try {
    contatoId = (await request.json()).contatoId
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!contatoId) return NextResponse.json({ ok: false })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // pega a última mensagem RECEBIDA com message_id (só dá pra marcar essas)
  const { data: msg } = await admin.from('whatsapp_mensagens')
    .select('message_id')
    .eq('contato_id', contatoId).eq('direcao', 'recebida')
    .not('message_id', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(1).maybeSingle()

  if (msg?.message_id) {
    const loja = await getLoja(admin, user.id).catch(() => null)
    await marcarComoLida({ messageId: msg.message_id, creds: loja?.creds })
  }
  return NextResponse.json({ ok: true })
}
