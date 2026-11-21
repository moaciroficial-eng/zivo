import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta, EstoqueRow, ImageRaw } from '@/lib/ofertas'
import { resolverProdutoDaImagem } from '@/lib/ofertas'

/* Lista as fotos de produto enviadas numa conversa nos últimos 30 dias, pra
   "Copiar oferta" a partir de qualquer envio antigo (não só ofertas rastreadas).
   Identificação do produto -> resolverProdutoDaImagem (lib/ofertas.ts),
   compartilhado com a rota de produto-da-mensagem (quadrinho de resposta citada). */

type MensagemRow = { id: string; timestamp: string; raw: { image?: ImageRaw } | null }
type OfertaRow = { id: string; pecas: PecaOferta[] }

type HistoricoItem = {
  foto_url: string
  timestamp: string
  encontrado: boolean
  estoque_id?: string
  nome?: string
  marca?: string | null
  tamanhos?: string[]
  preco_de?: number | null
  preco_por?: number | null
  caption?: string | null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const contatoId = request.nextUrl.searchParams.get('contatoId')
  if (!contatoId) return NextResponse.json({ ok: false, erro: 'contatoId é obrigatório.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: contato } = await admin.from('whatsapp_contatos').select('id').eq('id', contatoId).eq('user_id', user.id).maybeSingle()
  if (!contato) return NextResponse.json({ ok: false, erro: 'Contato não encontrado.' }, { status: 404 })

  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: mensagens } = await admin.from('whatsapp_mensagens')
    .select('id, timestamp, raw')
    .eq('contato_id', contatoId).eq('direcao', 'enviada').eq('tipo', 'imagem')
    .gte('timestamp', desde).order('timestamp', { ascending: false }).limit(200)

  const msgs = (mensagens ?? []) as MensagemRow[]
  const ofertaIds = [...new Set(msgs.map(m => m.raw?.image?.ofertaId).filter((v): v is string => !!v))]

  const [{ data: ofertasRows }, { data: estoqueRows }] = await Promise.all([
    ofertaIds.length
      ? admin.from('ofertas').select('id, pecas').eq('user_id', user.id).in('id', ofertaIds)
      : Promise.resolve({ data: [] as OfertaRow[] }),
    admin.from('estoque').select('id, nome, marca, status, tamanhos').eq('user_id', user.id),
  ])

  const ofertaPorId = new Map((ofertasRows ?? []).map((o: OfertaRow) => [o.id, o]))
  const estoque = (estoqueRows ?? []) as EstoqueRow[]

  const itens = msgs.flatMap((m): HistoricoItem[] => {
    const img = m.raw?.image
    if (!img?.imageUrl) return []
    const r = resolverProdutoDaImagem(img, ofertaPorId, estoque)
    if (!r.encontrado) return [{ foto_url: img.imageUrl, timestamp: m.timestamp, encontrado: false, caption: img.caption ?? null }]
    return [{
      foto_url: img.imageUrl, timestamp: m.timestamp, encontrado: true,
      estoque_id: r.estoque_id, nome: r.nome, marca: r.marca,
      tamanhos: r.tamanhos, preco_de: r.preco_de, preco_por: r.preco_por,
    }]
  })

  return NextResponse.json({ ok: true, itens })
}
