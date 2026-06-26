import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clienteId } = await request.json()
  if (!clienteId) return NextResponse.json({ error: 'clienteId obrigatório' }, { status: 400 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date().toISOString().split('T')[0]

  const [{ data: vendas }, { data: cliente }] = await Promise.all([
    admin.from('vendas')
      .select('id,valor,data_venda,presente,produtos')
      .eq('user_id', user.id)
      .eq('cliente_id', clienteId)
      .order('data_venda', { ascending: true }),
    admin.from('clientes')
      .select('id,nome,tamanho_camiseta,tamanho_calca,tamanho_tenis')
      .eq('id', clienteId)
      .single(),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const todasVendas = vendas ?? []
  const vendasProprias = todasVendas.filter(v => !v.presente)

  const totalGasto = todasVendas.reduce((s, v) => s + Number(v.valor), 0)
  const qtdCompras = todasVendas.length
  const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0

  const ultimaCompra = todasVendas.length > 0
    ? todasVendas[todasVendas.length - 1].data_venda
    : null

  const diasSemComprar = ultimaCompra
    ? Math.round((new Date(hoje).getTime() - new Date(ultimaCompra).getTime()) / 86400000)
    : null

  /* Ritmo médio entre compras (só compras próprias) */
  let ritmoMedio: number | null = null
  if (vendasProprias.length >= 2) {
    const sorted = [...vendasProprias].sort((a, b) => a.data_venda.localeCompare(b.data_venda))
    const intervalos: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervalos.push(Math.round((new Date(sorted[i].data_venda).getTime() - new Date(sorted[i - 1].data_venda).getTime()) / 86400000))
    }
    ritmoMedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
  }

  /* Mês de pico */
  const porMes: Record<string, number> = {}
  for (const v of vendasProprias) {
    const m = v.data_venda.slice(0, 7)
    porMes[m] = (porMes[m] ?? 0) + 1
  }
  const mesPico = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  /* Marcas favoritas */
  const marcasCount: Record<string, number> = {}
  for (const v of vendasProprias) {
    for (const p of (v.produtos as { marca?: string }[] ?? [])) {
      if (p.marca) marcasCount[p.marca] = (marcasCount[p.marca] ?? 0) + 1
    }
  }
  const marcasFavoritas = Object.entries(marcasCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m)

  /* Classificação */
  let classificacao: string | null = null
  if (qtdCompras >= 5 && totalGasto >= 1000) classificacao = 'vip'
  else if (qtdCompras >= 3) classificacao = 'frequente'
  else if (qtdCompras >= 1) classificacao = 'ocasional'

  /* Tendência */
  let tendencia: string | null = null
  if (ritmoMedio && diasSemComprar !== null) {
    const desvio = diasSemComprar / ritmoMedio
    if (desvio < 0.8) tendencia = 'aquecendo'
    else if (desvio < 1.2) tendencia = 'estavel'
    else if (desvio < 1.8) tendencia = 'esfriando'
    else tendencia = 'desaparecendo'
  }

  /* Tamanhos do cadastro */
  const tamanhos: string[] = []
  if (cliente.tamanho_camiseta) tamanhos.push(`Camiseta: ${cliente.tamanho_camiseta}`)
  if (cliente.tamanho_calca) tamanhos.push(`Calça: ${cliente.tamanho_calca}`)
  if (cliente.tamanho_tenis) tamanhos.push(`Tênis: ${cliente.tamanho_tenis}`)

  const insight = {
    user_id: user.id,
    cliente_id: clienteId,
    classificacao,
    tendencia,
    total_gasto: totalGasto,
    qtd_compras: qtdCompras,
    ticket_medio: ticketMedio,
    dias_sem_comprar: diasSemComprar,
    ultima_compra: ultimaCompra,
    ritmo_compra_dias: ritmoMedio,
    mes_pico: mesPico,
    marcas_favoritas: marcasFavoritas.length > 0 ? marcasFavoritas : null,
    tamanhos: tamanhos.length > 0 ? tamanhos : null,
  }

  await admin.from('contato_insights').upsert(insight, { onConflict: 'user_id,cliente_id' })

  return NextResponse.json({ ok: true, insight })
}
