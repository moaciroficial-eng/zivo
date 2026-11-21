import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta } from '@/lib/ofertas'

/* Registro de cada envio de fotos (oferta) -- guarda as peças, tamanhos
   disponíveis e preço de/por no momento do envio, pra poder "copiar oferta"
   e reenviar/encaminhar depois sem refazer tudo. */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { contatoId, pecas, origemOfertaId } = await request.json().catch(() => ({})) as {
    contatoId?: string; pecas?: PecaOferta[]; origemOfertaId?: string
  }
  if (!contatoId || !Array.isArray(pecas) || pecas.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Oferta inválida.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: contato } = await admin.from('whatsapp_contatos')
    .select('cliente_id').eq('id', contatoId).eq('user_id', user.id).maybeSingle()

  const { data: oferta, error } = await admin.from('ofertas').insert({
    user_id: user.id,
    contato_id: contatoId,
    cliente_id: contato?.cliente_id ?? null,
    origem_oferta_id: origemOfertaId ?? null,
    pecas,
  }).select('id').single()

  if (error || !oferta) return NextResponse.json({ ok: false, erro: 'Falha ao salvar a oferta.' }, { status: 500 })
  return NextResponse.json({ ok: true, ofertaId: oferta.id })
}

/* Lista as últimas ofertas de um contato (mais recente primeiro) -- usado
   pelo botão "Copiar oferta" na conversa. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const contatoId = request.nextUrl.searchParams.get('contatoId')
  if (!contatoId) return NextResponse.json({ ok: false, erro: 'contatoId é obrigatório.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('ofertas')
    .select('id, pecas, created_at')
    .eq('user_id', user.id).eq('contato_id', contatoId)
    .order('created_at', { ascending: false }).limit(20)

  return NextResponse.json({ ok: true, ofertas: data ?? [] })
}
