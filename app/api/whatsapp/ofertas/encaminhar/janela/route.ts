import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const JANELA_24H_MS = 24 * 60 * 60 * 1000

/* Mesma regra de janela de 24h do encaminhar/preview, mas em lote e só pra
   exibir a etiqueta "janela aberta"/"fora da janela" em cada linha do
   seletor de contatos -- uma consulta só, em vez de uma por contato. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { contatoIds } = await request.json().catch(() => ({})) as { contatoIds?: string[] }
  if (!Array.isArray(contatoIds) || contatoIds.length === 0) {
    return NextResponse.json({ ok: true, abertos: [] })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: doUsuario } = await admin.from('whatsapp_contatos').select('id').eq('user_id', user.id).in('id', contatoIds)
  const idsValidos = (doUsuario ?? []).map((c: { id: string }) => c.id)
  if (idsValidos.length === 0) return NextResponse.json({ ok: true, abertos: [] })

  const desde = new Date(Date.now() - JANELA_24H_MS).toISOString()
  const { data: recentes } = await admin.from('whatsapp_mensagens')
    .select('contato_id').eq('direcao', 'recebida').gte('timestamp', desde).in('contato_id', idsValidos)

  const abertos = [...new Set((recentes ?? []).map((m: { contato_id: string }) => m.contato_id))]
  return NextResponse.json({ ok: true, abertos })
}
