import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Cria um checkout do Mercado Pago pra uma peça do clube.
   Retorna a URL (init_point) pra redirecionar o cliente. O pagamento é
   confirmado depois pelo webhook, que baixa o estoque e registra a venda. */

export async function POST(request: NextRequest) {
  const { slug, estoqueId, tamanho, email } = await request.json() as {
    slug?: string; estoqueId?: string; tamanho?: string; email?: string
  }
  if (!slug || !estoqueId) return NextResponse.json({ ok: false, erro: 'Dados incompletos.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: loja } = await admin.from('loja_config')
    .select('user_id, nome_loja, clube_ativo, mp_access_token').eq('clube_slug', slug).maybeSingle()
  if (!loja || !loja.clube_ativo) return NextResponse.json({ ok: false, erro: 'Clube indisponível.' })
  if (!loja.mp_access_token) return NextResponse.json({ ok: false, erro: 'Pagamento online não configurado.' })

  const { data: prod } = await admin.from('estoque')
    .select('id, nome, marca, preco_venda, preco_oportunidade, oportunidade, tamanhos, status')
    .eq('id', estoqueId).eq('user_id', loja.user_id).maybeSingle()
  if (!prod || !prod.oportunidade || prod.status === 'vendido') return NextResponse.json({ ok: false, erro: 'Produto indisponível.' })

  const preco = Number(prod.preco_oportunidade ?? prod.preco_venda ?? 0)
  if (!(preco > 0)) return NextResponse.json({ ok: false, erro: 'Produto sem preço.' })

  const titulo = `${prod.nome}${prod.marca ? ` (${prod.marca})` : ''}${tamanho ? ` — ${tamanho}` : ''}`

  // cria o pedido pendente
  const { data: pedido } = await admin.from('clube_pedidos').insert({
    user_id: loja.user_id, estoque_id: prod.id, produto_nome: titulo, tamanho: tamanho ?? null,
    valor: preco, email_membro: (email ?? '').toLowerCase() || null, status: 'pendente',
  }).select('id').single()
  if (!pedido) return NextResponse.json({ ok: false, erro: 'Falha ao criar o pedido.' }, { status: 500 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://zivo-navy.vercel.app'
  try {
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loja.mp_access_token}` },
      body: JSON.stringify({
        items: [{ title: titulo, quantity: 1, unit_price: preco, currency_id: 'BRL' }],
        external_reference: pedido.id,
        notification_url: `${origin}/api/clube/webhook/mp?slug=${slug}`,
        back_urls: {
          success: `${origin}/clube/${slug}?status=sucesso`,
          pending: `${origin}/clube/${slug}?status=pendente`,
          failure: `${origin}/clube/${slug}?status=falhou`,
        },
        auto_return: 'approved',
        metadata: { pedido_id: pedido.id, user_id: loja.user_id },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.init_point) {
      return NextResponse.json({ ok: false, erro: data?.message || 'Falha ao criar o checkout.' }, { status: 502 })
    }
    await admin.from('clube_pedidos').update({ mp_preference_id: data.id }).eq('id', pedido.id)
    return NextResponse.json({ ok: true, url: data.init_point })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro no checkout.' }, { status: 502 })
  }
}
