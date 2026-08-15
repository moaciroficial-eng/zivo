import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Webhook do Mercado Pago: quando um pagamento é aprovado, marca o pedido
   como pago, BAIXA o estoque no tamanho certo e registra a venda no Zivo.
   O slug (loja) vem na query da notification_url. Idempotente. */

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')

  // id do pagamento pode vir no corpo (v2) ou na query (legado)
  let paymentId: string | null = url.searchParams.get('data.id') || url.searchParams.get('id')
  let tipo = url.searchParams.get('type') || url.searchParams.get('topic')
  try {
    const body = await request.json()
    if (body?.data?.id) paymentId = String(body.data.id)
    if (body?.type) tipo = String(body.type)
  } catch { /* corpo vazio (notificação de teste) */ }

  if (!slug) return NextResponse.json({ ok: true })                 // sempre 200 pro MP não reenviar em looping
  if (tipo && tipo !== 'payment') return NextResponse.json({ ok: true })
  if (!paymentId) return NextResponse.json({ ok: true })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: loja } = await admin.from('loja_config').select('user_id, mp_access_token').eq('clube_slug', slug).maybeSingle()
  if (!loja?.mp_access_token) return NextResponse.json({ ok: true })

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${loja.mp_access_token}` }, cache: 'no-store',
    })
    const pay = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ ok: true })

    const pedidoId = pay?.external_reference as string | undefined
    if (pay?.status !== 'approved' || !pedidoId) return NextResponse.json({ ok: true })

    const { data: pedido } = await admin.from('clube_pedidos').select('*').eq('id', pedidoId).eq('user_id', loja.user_id).maybeSingle()
    if (!pedido) return NextResponse.json({ ok: true })

    /* Idempotência ATÔMICA: o MP dispara o webhook mais de uma vez. Só segue
       quem conseguir mudar de 'pendente' -> 'pago' (o update condicional).
       Sem isso, duas notificações quase simultâneas duplicavam a venda. */
    const { data: claim } = await admin.from('clube_pedidos')
      .update({ status: 'pago', mp_payment_id: String(paymentId) })
      .eq('id', pedidoId).eq('status', 'pendente').select('id')
    if (!claim || claim.length === 0) return NextResponse.json({ ok: true })  // já processado

    /* Linka o comprador ao cadastro existente (por email do clube) */
    let clienteId: string | null = null
    let clienteNome = pedido.email_membro || 'Cliente Clube'
    if (pedido.email_membro) {
      const { data: membro } = await admin.from('clube_membros')
        .select('cliente_id, nome').eq('user_id', loja.user_id).ilike('email', pedido.email_membro).maybeSingle()
      if (membro?.cliente_id) {
        clienteId = membro.cliente_id
        const { data: cli } = await admin.from('clientes').select('nome').eq('id', membro.cliente_id).maybeSingle()
        clienteNome = cli?.nome || membro.nome || clienteNome
      } else if (membro?.nome) {
        clienteNome = membro.nome
      }
    }

    // itens do pedido (carrinho) — cai no item único se for pedido antigo
    type ItemPed = { estoque_id: string | null; nome: string; tamanho: string | null; valor: number }
    const itens: ItemPed[] = Array.isArray(pedido.itens) && pedido.itens.length
      ? (pedido.itens as ItemPed[])
      : [{ estoque_id: pedido.estoque_id ?? null, nome: pedido.produto_nome, tamanho: pedido.tamanho ?? null, valor: Number(pedido.valor) || 0 }]

    // baixa estoque de cada item, no tamanho
    for (const it of itens) {
      if (!it.estoque_id) continue
      const { data: item } = await admin.from('estoque').select('tamanhos').eq('id', it.estoque_id).maybeSingle()
      const tams = ((item?.tamanhos as { tamanho: string | number; qtd: number }[]) ?? []).map(t => ({ ...t }))
      let idx = it.tamanho ? tams.findIndex(t => String(t.tamanho).toLowerCase() === String(it.tamanho).toLowerCase()) : -1
      if (idx < 0) idx = tams.findIndex(t => (Number(t.qtd) || 0) > 0)
      if (idx >= 0) {
        tams[idx] = { ...tams[idx], qtd: Math.max(0, (Number(tams[idx].qtd) || 0) - 1) }
        await admin.from('estoque').update({ tamanhos: tams }).eq('id', it.estoque_id)
      }
    }

    // registra UMA venda no Zivo com todos os itens, linkada ao cliente
    await admin.from('vendas').insert({
      user_id: loja.user_id,
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      valor: Number(pedido.valor) || 0,
      data_venda: new Date().toISOString().split('T')[0],
      forma_pagamento: 'mercadopago',
      produtos: itens.map(it => ({ nome: it.nome, tamanho: it.tamanho ?? undefined, qtd: 1, preco_unitario: it.valor, estoque_id: it.estoque_id ?? undefined })),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

// MP às vezes valida o endpoint com GET
export async function GET() {
  return NextResponse.json({ ok: true })
}
