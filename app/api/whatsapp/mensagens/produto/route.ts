import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta, EstoqueRow, ImageRaw } from '@/lib/ofertas'
import { resolverProdutoDaImagem } from '@/lib/ofertas'

/* Identifica a peça de estoque por trás de UMA mensagem de imagem -- usado no
   quadrinho "respondendo a ..." quando o cliente cita uma foto de produto,
   pra mostrar nome/tamanho/preço e oferecer "Registrar venda dessa peça".
   Mesma lógica de casamento do histórico (ofertas/historico/route.ts), só que
   pra uma mensagem só em vez de uma conversa inteira. */

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const mensagemId = request.nextUrl.searchParams.get('mensagemId')
  if (!mensagemId) return NextResponse.json({ ok: false, erro: 'mensagemId é obrigatório.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: msg } = await admin.from('whatsapp_mensagens')
    .select('id, tipo, raw').eq('id', mensagemId).eq('user_id', user.id).maybeSingle()
  if (!msg || msg.tipo !== 'imagem') return NextResponse.json({ ok: true, encontrado: false })

  const img = (msg.raw as { image?: ImageRaw } | null)?.image
  if (!img?.imageUrl) return NextResponse.json({ ok: true, encontrado: false })

  const [{ data: ofertaRows }, { data: estoqueRows }] = await Promise.all([
    img.ofertaId
      ? admin.from('ofertas').select('id, pecas').eq('user_id', user.id).eq('id', img.ofertaId)
      : Promise.resolve({ data: [] as { id: string; pecas: PecaOferta[] }[] }),
    admin.from('estoque').select('id, nome, marca, status, tamanhos').eq('user_id', user.id),
  ])

  const ofertaPorId = new Map((ofertaRows ?? []).map(o => [o.id, o]))
  const estoque = (estoqueRows ?? []) as EstoqueRow[]
  const r = resolverProdutoDaImagem(img, ofertaPorId, estoque)

  return NextResponse.json({ ok: true, ...r })
}
