import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta } from '@/lib/ofertas'

type TamanhoQtd = { tamanho: string | number; qtd: number }
type EstoqueRow = { id: string; tamanhos: TamanhoQtd[] | null; status: string | null }

/* Devolve uma oferta já salva com o estoque RECHECADO na hora -- marca peça
   esgotada (sem nenhum tamanho com qtd > 0) e lista os tamanhos que ainda
   estão disponíveis, pro quadro de "Copiar oferta" avisar o dono antes de
   encaminhar de novo. Preço de/por fica como foi negociado na oferta original
   (o quadro só confere estoque, não recalcula preço). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: oferta } = await admin.from('ofertas')
    .select('id, pecas, contato_id, cliente_id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!oferta) return NextResponse.json({ ok: false, erro: 'Oferta não encontrada.' }, { status: 404 })

  const pecas = (oferta.pecas ?? []) as PecaOferta[]
  const ids = pecas.map(p => p.estoque_id)
  const { data: estoqueRows } = ids.length
    ? await admin.from('estoque').select('id, tamanhos, status').in('id', ids)
    : { data: [] as EstoqueRow[] }
  const porId = new Map((estoqueRows ?? []).map((e: EstoqueRow) => [e.id, e]))

  const itens = pecas.map(p => {
    const e = porId.get(p.estoque_id)
    if (!e || e.status === 'vendido') {
      return { ...p, tamanhosDisponiveis: [] as string[], esgotado: true }
    }
    const tamanhosDisponiveis = ((e.tamanhos ?? []) as TamanhoQtd[])
      .filter(t => Number(t.qtd) > 0).map(t => String(t.tamanho))
    return { ...p, tamanhosDisponiveis, esgotado: tamanhosDisponiveis.length === 0 }
  })

  return NextResponse.json({ ok: true, ofertaId: oferta.id, contatoId: oferta.contato_id, itens })
}
