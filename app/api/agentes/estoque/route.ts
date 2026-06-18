import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type TamanhoItem = { tamanho: string; qtd: number }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { userId, produto, marca, cor, tamanho } = body ?? {}

  if (!userId) return NextResponse.json({ ok: false, error: 'userId obrigatório' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let query = supabase
    .from('estoque')
    .select('id, nome, marca, cor, tamanhos, preco_venda, status')
    .eq('user_id', userId)
    .eq('status', 'disponivel')

  if (marca) query = query.ilike('marca', `%${marca}%`)
  if (produto) query = query.ilike('nome', `%${produto}%`)
  if (cor) query = query.ilike('cor', `%${cor}%`)

  const { data: itens } = await query.limit(10)
  if (!itens || itens.length === 0) {
    return NextResponse.json({ ok: true, encontrou: false, itens: [] })
  }

  /* Filtra por tamanho se informado */
  type EstoqueItem = { id: string; nome: string; marca: string; cor: string | null; tamanhos: TamanhoItem[]; preco_venda: number }
  const itensFiltrados: EstoqueItem[] = tamanho
    ? (itens as EstoqueItem[]).filter(i =>
        (i.tamanhos as TamanhoItem[]).some(t =>
          t.tamanho.toUpperCase() === tamanho.toUpperCase() && t.qtd > 0
        )
      )
    : (itens as EstoqueItem[]).filter(i =>
        (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0)
      )

  /* Formata para o agente usar na resposta */
  const resumo = itensFiltrados.map(i => {
    const tam = (i.tamanhos as TamanhoItem[]).filter(t => t.qtd > 0).map(t => t.tamanho).join(', ')
    return `${i.nome}${i.cor ? ` ${i.cor}` : ''} (${i.marca}) — Tamanhos: ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
  }).join('\n')

  return NextResponse.json({
    ok: true,
    encontrou: itensFiltrados.length > 0,
    itens: itensFiltrados,
    resumo,
  })
}
