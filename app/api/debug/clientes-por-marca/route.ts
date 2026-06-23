import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const marca = request.nextUrl.searchParams.get('marca') ?? 'aramis'
  const userId = process.env.WHATSAPP_USER_ID?.replace(/^﻿/, '').trim()

  if (!userId) return NextResponse.json({ erro: 'WHATSAPP_USER_ID não configurado' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: estoqueItems, error: errEstoque } = await admin
    .from('estoque')
    .select('id, nome, marca')
    .eq('user_id', userId)
    .ilike('marca', `%${marca}%`)

  const { data: vendas, error: errVendas } = await admin
    .from('vendas')
    .select('id, cliente_id, cliente_nome, produtos')
    .eq('user_id', userId)
    .gte('created_at', inicioMes)
    .limit(200)

  const estoqueIdSet = new Set((estoqueItems ?? []).map((e: { id: string }) => e.id))

  const clientesEncontrados: string[] = []
  const vendasComMarca: { id: string; cliente: string; produtos_com_marca: string[] }[] = []

  for (const venda of (vendas ?? [])) {
    const produtos = Array.isArray(venda.produtos) ? venda.produtos : []
    const produtosDaMarca = produtos.filter(
      (p: { estoque_id?: string; nome?: string }) => p.estoque_id && estoqueIdSet.has(p.estoque_id)
    )
    if (produtosDaMarca.length > 0) {
      clientesEncontrados.push(venda.cliente_nome ?? 'Avulso')
      vendasComMarca.push({
        id: venda.id,
        cliente: venda.cliente_nome,
        produtos_com_marca: produtosDaMarca.map((p: { nome?: string; estoque_id?: string }) => `${p.nome} (${p.estoque_id})`),
      })
    }
  }

  return NextResponse.json({
    marca_buscada: marca,
    userId,
    inicioMes,
    estoque_encontrado: estoqueItems?.length ?? 0,
    estoque_ids: estoqueItems?.map((e: { id: string; nome: string; marca: string }) => ({ id: e.id, nome: e.nome, marca: e.marca })),
    vendas_no_mes: vendas?.length ?? 0,
    vendas_com_marca: vendasComMarca.length,
    clientes: clientesEncontrados,
    detalhe_vendas: vendasComMarca,
    erro_estoque: errEstoque?.message,
    erro_vendas: errVendas?.message,
  })
}
