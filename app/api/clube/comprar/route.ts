import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, ipDaRequisicao } from '@/lib/rate-limit'

/* Cria um checkout do Mercado Pago pra uma peça do clube.
   Retorna a URL (init_point) pra redirecionar o cliente. O pagamento é
   confirmado depois pelo webhook, que baixa o estoque e registra a venda. */

type ItemCarrinho = { estoqueId: string; tamanho?: string | null }

export async function POST(request: NextRequest) {
  /* Rota pública: limita criação de checkout por IP pra evitar flood. */
  if (!rateLimit(`clube-comprar:${ipDaRequisicao(request)}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, erro: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const body = await request.json() as { slug?: string; email?: string; itens?: ItemCarrinho[]; estoqueId?: string; tamanho?: string }
  const slug = body.slug
  // aceita carrinho (itens[]) OU compra única (estoqueId) por retrocompat
  const carrinho: ItemCarrinho[] = Array.isArray(body.itens) && body.itens.length
    ? body.itens
    : (body.estoqueId ? [{ estoqueId: body.estoqueId, tamanho: body.tamanho }] : [])
  const email = body.email
  if (!slug || carrinho.length === 0) return NextResponse.json({ ok: false, erro: 'Dados incompletos.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: loja } = await admin.from('loja_config')
    .select('user_id, nome_loja, clube_ativo, mp_access_token').eq('clube_slug', slug).maybeSingle()
  if (!loja || !loja.clube_ativo) return NextResponse.json({ ok: false, erro: 'Clube indisponível.' })
  if (!loja.mp_access_token) return NextResponse.json({ ok: false, erro: 'Pagamento online não configurado.' })

  // valida cada item e monta os itens do MP + do pedido
  const mpItems: { title: string; quantity: number; unit_price: number; currency_id: string }[] = []
  const itensPedido: { estoque_id: string; nome: string; tamanho: string | null; valor: number }[] = []
  for (const it of carrinho) {
    const { data: prod } = await admin.from('estoque')
      .select('id, nome, marca, preco_venda, preco_oportunidade, oportunidade, status, clube_tamanhos')
      .eq('id', it.estoqueId).eq('user_id', loja.user_id).maybeSingle()
    if (!prod || !prod.oportunidade || prod.status === 'vendido') continue
    /* Respeita os tamanhos habilitados na oferta do clube (se houver restrição) */
    const permitidos = prod.clube_tamanhos as string[] | null
    if (permitidos && it.tamanho && !permitidos.includes(String(it.tamanho))) continue
    const preco = Number(prod.preco_oportunidade ?? prod.preco_venda ?? 0)
    if (!(preco > 0)) continue
    const titulo = `${prod.nome}${prod.marca ? ` (${prod.marca})` : ''}${it.tamanho ? ` — ${it.tamanho}` : ''}`
    mpItems.push({ title: titulo, quantity: 1, unit_price: preco, currency_id: 'BRL' })
    itensPedido.push({ estoque_id: prod.id, nome: titulo, tamanho: it.tamanho ?? null, valor: preco })
  }
  if (mpItems.length === 0) return NextResponse.json({ ok: false, erro: 'Nenhum item disponível.' })

  const total = itensPedido.reduce((s, i) => s + i.valor, 0)

  // cria o pedido pendente (multi-itens)
  const { data: pedido } = await admin.from('clube_pedidos').insert({
    user_id: loja.user_id,
    estoque_id: itensPedido.length === 1 ? itensPedido[0].estoque_id : null,
    produto_nome: itensPedido.map(i => i.nome).join(' + ').slice(0, 300),
    tamanho: itensPedido.length === 1 ? itensPedido[0].tamanho : null,
    itens: itensPedido,
    valor: total, email_membro: (email ?? '').toLowerCase() || null, status: 'pendente',
  }).select('id').single()
  if (!pedido) return NextResponse.json({ ok: false, erro: 'Falha ao criar o pedido.' }, { status: 500 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://zivo-navy.vercel.app'
  try {
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loja.mp_access_token}` },
      body: JSON.stringify({
        items: mpItems,
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
