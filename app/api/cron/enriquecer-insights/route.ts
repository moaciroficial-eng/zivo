import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const userId = process.env.WHATSAPP_USER_ID?.replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ erro: 'WHATSAPP_USER_ID ausente' })

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()

  /* Carrega dados base em paralelo */
  const [{ data: vendas }, { data: estoque }, { data: contatos }] = await Promise.all([
    admin.from('vendas').select('cliente_id, cliente_nome, valor, produtos, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(2000),
    admin.from('estoque').select('id, marca').eq('user_id', userId).limit(5000),
    admin.from('whatsapp_contatos').select('id, cliente_id, phone').eq('user_id', userId).limit(1000),
  ])

  const estoqueMap = new Map<string, string>(
    (estoque ?? []).filter(e => e.id && e.marca).map(e => [e.id, e.marca])
  )

  /* Agrupa vendas por cliente_id */
  type VendaRow = { cliente_id: string | null; cliente_nome: string | null; valor: number; produtos: unknown[]; created_at: string }
  const porCliente = new Map<string, VendaRow[]>()
  for (const v of (vendas ?? []) as VendaRow[]) {
    if (!v.cliente_id) continue
    const lista = porCliente.get(v.cliente_id) ?? []
    lista.push(v)
    porCliente.set(v.cliente_id, lista)
  }

  let atualizados = 0

  for (const [clienteId, vs] of porCliente) {
    const totalGasto = vs.reduce((s, v) => s + (Number(v.valor) || 0), 0)
    const qtdCompras = vs.length
    const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0
    const ultimaCompraDate = new Date(vs[0].created_at)
    const ultimaCompra = ultimaCompraDate.toISOString().split('T')[0]
    const diasSemComprar = Math.floor((agora.getTime() - ultimaCompraDate.getTime()) / 86400000)

    /* Marcas e tamanhos das vendas reais */
    const marcaCount = new Map<string, number>()
    const tamanhoCount = new Map<string, number>()
    for (const v of vs) {
      const produtos = Array.isArray(v.produtos) ? v.produtos : []
      for (const p of produtos as { estoque_id?: string; nome?: string; tamanho?: string }[]) {
        const marca = (p.estoque_id && estoqueMap.get(p.estoque_id)) ||
          p.nome?.match(/\(([^)]+)\)\s*$/)?.[ 1] || null
        if (marca) marcaCount.set(marca, (marcaCount.get(marca) ?? 0) + 1)
        if (p.tamanho) tamanhoCount.set(p.tamanho, (tamanhoCount.get(p.tamanho) ?? 0) + 1)
      }
    }

    const marcas = [...marcaCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
    const tamanhos = [...tamanhoCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
    const marcaPrincipal = marcas[0] ?? null

    /* Classificação RFM simples */
    let classificacao = 'ativo'
    if (diasSemComprar > 90) classificacao = 'perdido'
    else if (diasSemComprar > 45) classificacao = 'em_risco'
    else if (qtdCompras >= 5 || totalGasto >= 1500) classificacao = 'vip'
    else if (qtdCompras >= 3) classificacao = 'fiel'

    /* Tendência: comprou mais na primeira ou segunda metade dos registros */
    const meio = Math.floor(vs.length / 2)
    const recentes = vs.slice(0, meio)
    const antigas = vs.slice(meio)
    const mediaRecente = recentes.reduce((s, v) => s + Number(v.valor), 0) / (recentes.length || 1)
    const mediaAntiga = antigas.reduce((s, v) => s + Number(v.valor), 0) / (antigas.length || 1)
    const tendencia = mediaRecente > mediaAntiga * 1.1 ? 'crescendo' : mediaRecente < mediaAntiga * 0.9 ? 'caindo' : 'estavel'

    /* Upsert no contato vinculado */
    const contatoVinculado = (contatos ?? []).find(c => c.cliente_id === clienteId)
    if (!contatoVinculado) continue

    await admin.from('contato_insights').upsert({
      user_id: userId,
      contato_id: contatoVinculado.id,
      cliente_id: clienteId,
      marca_principal: marcaPrincipal,
      marcas_favoritas: marcas.slice(0, 5),
      tamanhos: tamanhos.slice(0, 4),
      ultima_compra: ultimaCompra,
      total_gasto: totalGasto,
      qtd_compras: qtdCompras,
      ticket_medio: ticketMedio,
      dias_sem_comprar: diasSemComprar,
      classificacao,
      tendencia,
      ultima_analise: agora.toISOString(),
      updated_at: agora.toISOString(),
    }, { onConflict: 'contato_id' })

    atualizados++
  }

  return NextResponse.json({ ok: true, atualizados })
}
