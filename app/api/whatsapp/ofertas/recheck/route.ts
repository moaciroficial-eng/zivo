import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PecaOferta } from '@/lib/ofertas'

type TamanhoQtd = { tamanho: string | number; qtd: number }
type EstoqueRow = { id: string; tamanhos: TamanhoQtd[] | null; status: string | null }

/* Mesma recheagem de estoque do quadro de "Copiar oferta" (GET /ofertas/[id]),
   mas pra peças escolhidas direto no histórico de fotos de uma conversa --
   aqui não existe uma única oferta de origem, então recebe as peças já montadas. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { pecas } = await request.json().catch(() => ({})) as { pecas?: PecaOferta[] }
  if (!Array.isArray(pecas) || pecas.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Nenhuma peça selecionada.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const ids = pecas.map(p => p.estoque_id)
  const { data: estoqueRows } = await admin.from('estoque').select('id, tamanhos, status').eq('user_id', user.id).in('id', ids)
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

  return NextResponse.json({ ok: true, itens })
}
