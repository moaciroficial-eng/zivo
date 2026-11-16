import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const JANELA_24H_MS = 24 * 60 * 60 * 1000

/* Pra cada contato escolhido, diz se está dentro da janela de 24h (pode
   mandar foto livre) ou fora (precisa de template aprovado primeiro). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { contatoIds } = await request.json().catch(() => ({})) as { contatoIds?: string[] }
  if (!Array.isArray(contatoIds) || contatoIds.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Escolha pelo menos um contato.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: contatos } = await admin.from('whatsapp_contatos')
    .select('id, nome, phone').eq('user_id', user.id).in('id', contatoIds)

  const agora = Date.now()
  const dentro: { id: string; nome: string | null }[] = []
  const fora: { id: string; nome: string | null }[] = []

  for (const c of (contatos ?? []) as { id: string; nome: string | null; phone: string }[]) {
    const { data: ultima } = await admin.from('whatsapp_mensagens')
      .select('timestamp').eq('contato_id', c.id).eq('direcao', 'recebida')
      .order('timestamp', { ascending: false }).limit(1).maybeSingle()
    const t = ultima?.timestamp ? new Date(ultima.timestamp).getTime() : null
    if (t != null && agora - t < JANELA_24H_MS) dentro.push({ id: c.id, nome: c.nome })
    else fora.push({ id: c.id, nome: c.nome })
  }

  return NextResponse.json({ ok: true, dentro, fora })
}
