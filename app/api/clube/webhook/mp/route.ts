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
    if (!pedido || pedido.status === 'pago') return NextResponse.json({ ok: true })   // idempotência

    // marca pago
    await admin.from('clube_pedidos').update({ status: 'pago', mp_payment_id: String(paymentId) }).eq('id', pedidoId)

    // baixa estoque no tamanho
    if (pedido.estoque_id) {
      const { data: item } = await admin.from('estoque').select('tamanhos').eq('id', pedido.estoque_id).maybeSingle()
      const tams = ((item?.tamanhos as { tamanho: string | number; qtd: number }[]) ?? []).map(t => ({ ...t }))
      let idx = pedido.tamanho ? tams.findIndex(t => String(t.tamanho).toLowerCase() === String(pedido.tamanho).toLowerCase()) : -1
      if (idx < 0) idx = tams.findIndex(t => (Number(t.qtd) || 0) > 0)
      if (idx >= 0) {
        tams[idx] = { ...tams[idx], qtd: Math.max(0, (Number(tams[idx].qtd) || 0) - 1) }
        await admin.from('estoque').update({ tamanhos: tams }).eq('id', pedido.estoque_id)
      }
    }

    // registra a venda no Zivo
    await admin.from('vendas').insert({
      user_id: loja.user_id,
      cliente_nome: pedido.email_membro || 'Cliente Clube',
      valor: Number(pedido.valor) || 0,
      data_venda: new Date().toISOString().split('T')[0],
      forma_pagamento: 'mercadopago',
      produtos: [{ nome: pedido.produto_nome, tamanho: pedido.tamanho ?? undefined, qtd: 1, preco_unitario: Number(pedido.valor) || 0, estoque_id: pedido.estoque_id ?? undefined }],
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
