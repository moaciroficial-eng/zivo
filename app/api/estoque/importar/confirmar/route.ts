import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Grava os produtos revisados no estoque (status 'disponivel'). */

type Tam = { tamanho: string; qtd: number }
type ProdutoIn = {
  nome: string; marca?: string | null; cor?: string | null; categoria?: string | null
  genero?: string | null; tamanhos?: Tam[]; preco_venda?: number | null; preco_custo?: number | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { produtos } = await request.json() as { produtos: ProdutoIn[] }
  if (!Array.isArray(produtos) || !produtos.length) return NextResponse.json({ ok: false, erro: 'Nada pra importar.' }, { status: 400 })

  const limpo = (v: unknown) => { const s = String(v ?? '').trim(); return s && s.toLowerCase() !== 'null' ? s : null }
  const genero = (v: unknown) => { const c = String(v ?? '').toUpperCase().charAt(0); return c === 'M' || c === 'F' ? c : c === 'U' ? 'U' : null }
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (const p of produtos) {
    if (!p?.nome?.trim()) continue
    const grade = (Array.isArray(p.tamanhos) ? p.tamanhos : [])
      .map(t => ({ tamanho: String(t.tamanho ?? 'UN').trim().toUpperCase() || 'UN', qtd: Math.max(1, Math.round(Number(t.qtd) || 1)) }))
      .filter(t => t.tamanho)
    rows.push({
      user_id: user.id,
      nome: p.nome.trim(),
      marca: limpo(p.marca),
      cor: limpo(p.cor),
      categoria: limpo(p.categoria),
      genero: genero(p.genero),
      tamanhos: grade.length ? grade : [{ tamanho: 'UN', qtd: 1 }],
      preco_venda: num(p.preco_venda),
      preco_custo: num(p.preco_custo),
      status: 'disponivel',
    })
  }

  let inseridos = 0
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500)
    const { error } = await supabase.from('estoque').insert(lote)
    if (error) return NextResponse.json({ ok: false, erro: error.message, inseridos }, { status: 500 })
    inseridos += lote.length
  }

  return NextResponse.json({ ok: true, inseridos })
}
