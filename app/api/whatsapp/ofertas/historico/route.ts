import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta } from '@/lib/ofertas'

/* Lista as fotos de produto enviadas numa conversa nos últimos 30 dias, pra
   "Copiar oferta" a partir de qualquer envio antigo (não só ofertas rastreadas).
   Identifica o produto via ofertaId da mensagem (quando existe) ou, nas mensagens
   mais antigas que não têm esse rastro, tentando casar nome/marca na legenda com
   o estoque. O que não achar vem marcado como não encontrado, pro dono excluir. */

const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

function parseBRL(s: string): number | null {
  const n = Number(s.replace('R$', '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseLegenda(caption: string | null): { base: string; de: number | null; por: number | null } {
  if (!caption) return { base: '', de: null, por: null }
  const partes = caption.split(' — ')
  const base = (partes[0] ?? '').trim()
  const precoParte = (partes[1] ?? '').trim()
  if (!precoParte) return { base, de: null, por: null }
  const deEPor = precoParte.match(/^de (R\$[\d.,]+) por (R\$[\d.,]+)$/)
  if (deEPor) return { base, de: parseBRL(deEPor[1]), por: parseBRL(deEPor[2]) }
  const soPreco = precoParte.match(/^(R\$[\d.,]+)$/)
  if (soPreco) return { base, de: null, por: parseBRL(soPreco[1]) }
  return { base, de: null, por: null }
}

type TamanhoQtd = { tamanho: string | number; qtd: number }
type EstoqueRow = { id: string; nome: string; marca: string | null; status: string | null; tamanhos: TamanhoQtd[] | null }
type ImageRaw = { imageUrl?: string; caption?: string | null; ofertaId?: string | null }
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

  function acharPorNome(base: string): EstoqueRow | null {
    const nb = norm(base)
    if (!nb) return null
    const candidatos = estoque.filter(e => {
      const n = norm(e.nome)
      if (!n || !nb.includes(n)) return false
      if (e.marca && !nb.includes(norm(e.marca))) return false
      return true
    })
    if (candidatos.length === 0) return null
    candidatos.sort((a, b) => norm(b.nome).length - norm(a.nome).length)
    return candidatos[0]
  }

  const itens = msgs.flatMap((m): HistoricoItem[] => {
    const img = m.raw?.image
    if (!img?.imageUrl) return []

    if (img.ofertaId) {
      const of = ofertaPorId.get(img.ofertaId)
      const peca = of?.pecas?.find(p => p.foto_url === img.imageUrl)
      if (peca) {
        return [{
          foto_url: img.imageUrl, timestamp: m.timestamp, encontrado: true,
          estoque_id: peca.estoque_id, nome: peca.nome, marca: peca.marca,
          tamanhos: peca.tamanhos, preco_de: peca.preco_de, preco_por: peca.preco_por,
        }]
      }
    }

    const { base, de, por } = parseLegenda(img.caption ?? null)
    const e = acharPorNome(base)
    if (!e) return [{ foto_url: img.imageUrl, timestamp: m.timestamp, encontrado: false, caption: img.caption ?? null }]

    const tamanhosAtuais = ((e.tamanhos ?? []) as TamanhoQtd[]).filter(t => Number(t.qtd) > 0).map(t => String(t.tamanho))
    return [{
      foto_url: img.imageUrl, timestamp: m.timestamp, encontrado: true,
      estoque_id: e.id, nome: e.nome, marca: e.marca,
      tamanhos: tamanhosAtuais, preco_de: de, preco_por: por ?? de,
    }]
  })

  return NextResponse.json({ ok: true, itens })
}
