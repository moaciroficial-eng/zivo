import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type TamanhoItem = { tamanho: string; qtd: number }
type EstoqueItem = {
  id: string; nome: string; marca: string
  cor: string | null; tamanhos: TamanhoItem[]; preco_venda: number
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { userId, marca, produto } = body ?? {}

  if (!userId) return NextResponse.json({ ok: false, error: 'userId obrigatório' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Busca ampla por marca — cor e tamanho ficam no nome, então o Claude vai inferir */
  let query = supabase
    .from('estoque')
    .select('id, nome, marca, cor, tamanhos, preco_venda')
    .eq('user_id', userId)
    .eq('status', 'disponivel')

  if (marca) query = query.ilike('marca', `%${marca}%`)
  /* Se não achou pela marca, tenta pelo nome do produto */
  if (produto && !marca) query = query.ilike('nome', `%${produto}%`)

  const { data: itens } = await query.limit(30)

  /* Filtra só os que têm estoque disponível */
  const comEstoque = ((itens ?? []) as EstoqueItem[]).filter(i =>
    (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0)
  )

  /* Formata catálogo completo para o agente raciocinar */
  const catalogo = comEstoque.map(i => {
    const tam = (i.tamanhos as TamanhoItem[])
      .filter(t => t.qtd > 0)
      .map(t => `${t.tamanho}(${t.qtd})`)
      .join(' ')
    const cor = i.cor ? ` | Cor: ${i.cor}` : ''
    return `• ${i.nome}${cor} — Tamanhos: ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
  }).join('\n')

  return NextResponse.json({
    ok: true,
    total: comEstoque.length,
    catalogo: catalogo || 'Nenhum produto encontrado para esta marca.',
    itens: comEstoque,
  })
}
