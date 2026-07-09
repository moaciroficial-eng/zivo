import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type TamanhoItem = { tamanho: string; qtd: number }
type EstoqueItem = {
  id: string; nome: string; marca: string
  cor: string | null; tamanhos: TamanhoItem[]; preco_venda: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscar(supabase: any, userId: string, campo: 'marca' | 'nome', valor: string) {
  const { data } = await supabase
    .from('estoque')
    .select('id, nome, marca, cor, tamanhos, preco_venda')
    .eq('user_id', userId)
    .eq('status', 'disponivel')
    .ilike(campo, `%${valor}%`)
    .limit(100)
  return (data ?? []) as EstoqueItem[]
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const { userId, marca, produto } = body ?? {}

  if (!userId) return NextResponse.json({ ok: false, error: 'userId obrigatório' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Busca por marca e nome em paralelo para não perder itens */
  const resultados: EstoqueItem[][] = []

  if (marca) {
    const [porMarca, porNome] = await Promise.all([
      buscar(supabase, userId, 'marca', marca),
      buscar(supabase, userId, 'nome',  marca),
    ])
    resultados.push(porMarca, porNome)
  }

  if (produto) {
    const [porNome, porMarca] = await Promise.all([
      buscar(supabase, userId, 'nome',  produto),
      buscar(supabase, userId, 'marca', produto),
    ])
    resultados.push(porNome, porMarca)
  }

  if (!marca && !produto) {
    const { data } = await supabase
      .from('estoque')
      .select('id, nome, marca, cor, tamanhos, preco_venda')
      .eq('user_id', userId)
      .eq('status', 'disponivel')
      .limit(200)
    resultados.push((data ?? []) as EstoqueItem[])
  }

  /* Deduplica por id */
  const visto = new Set<string>()
  const itens: EstoqueItem[] = []
  for (const lista of resultados) {
    for (const item of lista) {
      if (!visto.has(item.id)) { visto.add(item.id); itens.push(item) }
    }
  }

  const comEstoque = itens.filter(i =>
    (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0)
  )

  const catalogo = comEstoque.map(i => {
    const tam = (i.tamanhos as TamanhoItem[])
      .filter(t => t.qtd > 0)
      .map(t => `${t.tamanho}(${t.qtd})`).join(' ')
    const cor = i.cor ? ` | Cor: ${i.cor}` : ''
    return `• ${i.nome}${cor} — Tamanhos: ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
  }).join('\n')

  return NextResponse.json({
    ok: true,
    total: comEstoque.length,
    catalogo: catalogo || 'Nenhum produto encontrado para esta busca.',
    itens: comEstoque,
  })
}
