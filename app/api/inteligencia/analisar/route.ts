import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })

  const userId = user.id
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()

  /* Carrega tudo em paralelo */
  const [{ data: vendas }, { data: estoque }, { data: contatos }, { data: config }] = await Promise.all([
    admin.from('vendas').select('cliente_id, valor, produtos, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(2000),
    admin.from('estoque').select('id, nome, marca, cor, tamanhos, preco_venda').eq('user_id', userId).limit(5000),
    admin.from('whatsapp_contatos').select('id, cliente_id, phone').eq('user_id', userId).limit(1000),
    admin.from('loja_config').select('nome_loja').eq('user_id', userId).maybeSingle(),
  ])

  const { data: clientes } = await admin.from('clientes').select('id, nome').eq('user_id', userId).limit(500)
  const clienteMap = new Map((clientes ?? []).map(c => [c.id, c.nome]))

  const estoqueMap = new Map<string, string>(
    (estoque ?? []).filter(e => e.id && e.marca).map(e => [e.id, e.marca])
  )

  /* Enriquece insights por cliente */
  type VendaRow = { cliente_id: string | null; valor: number; produtos: unknown[]; created_at: string }
  const porCliente = new Map<string, VendaRow[]>()
  for (const v of (vendas ?? []) as VendaRow[]) {
    if (!v.cliente_id) continue
    const lista = porCliente.get(v.cliente_id) ?? []
    lista.push(v)
    porCliente.set(v.cliente_id, lista)
  }

  type TamanhoItem = { tamanho: string; qtd: number }

  for (const [clienteId, vs] of porCliente) {
    const totalGasto = vs.reduce((s, v) => s + (Number(v.valor) || 0), 0)
    const qtdCompras = vs.length
    const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0
    const ultimaCompraDate = new Date(vs[0].created_at)
    const ultimaCompra = ultimaCompraDate.toISOString().split('T')[0]
    const diasSemComprar = Math.floor((agora.getTime() - ultimaCompraDate.getTime()) / 86400000)

    const marcaCount = new Map<string, number>()
    const tamanhoCount = new Map<string, number>()
    for (const v of vs) {
      for (const p of (Array.isArray(v.produtos) ? v.produtos : []) as { estoque_id?: string; nome?: string; tamanho?: string }[]) {
        const marca = (p.estoque_id && estoqueMap.get(p.estoque_id)) || p.nome?.match(/\(([^)]+)\)\s*$/)?.[ 1] || null
        if (marca) marcaCount.set(marca, (marcaCount.get(marca) ?? 0) + 1)
        if (p.tamanho) tamanhoCount.set(p.tamanho, (tamanhoCount.get(p.tamanho) ?? 0) + 1)
      }
    }

    const marcas = [...marcaCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
    const tamanhos = [...tamanhoCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])

    let classificacao = 'ativo'
    if (diasSemComprar > 90) classificacao = 'perdido'
    else if (diasSemComprar > 45) classificacao = 'em_risco'
    else if (qtdCompras >= 5 || totalGasto >= 1500) classificacao = 'vip'
    else if (qtdCompras >= 3) classificacao = 'fiel'

    const contatoVinculado = (contatos ?? []).find(c => c.cliente_id === clienteId)
    if (!contatoVinculado) continue

    await admin.from('contato_insights').upsert({
      user_id: userId, contato_id: contatoVinculado.id, cliente_id: clienteId,
      marca_principal: marcas[0] ?? null, marcas_favoritas: marcas.slice(0, 5),
      tamanhos: tamanhos.slice(0, 4), ultima_compra: ultimaCompra,
      total_gasto: totalGasto, qtd_compras: qtdCompras, ticket_medio: ticketMedio,
      dias_sem_comprar: diasSemComprar, classificacao,
      ultima_analise: agora.toISOString(), updated_at: agora.toISOString(),
    }, { onConflict: 'contato_id' })
  }

  /* Recarrega insights atualizados */
  const { data: insights } = await admin.from('contato_insights')
    .select('cliente_id, marca_principal, marcas_favoritas, tamanhos, classificacao, total_gasto, qtd_compras, ticket_medio, dias_sem_comprar')
    .eq('user_id', userId).limit(200)

  if (!insights?.length) {
    return NextResponse.json({ ok: false, erro: 'Nenhum insight encontrado. Verifique se há vendas com clientes vinculados.' })
  }

  const estoqueDisponivel = (estoque ?? []).filter(e => (e.tamanhos as TamanhoItem[]).some(t => t.qtd > 0))
  const faturamentoMes = (vendas ?? []).filter(v => v.created_at >= inicioMes).reduce((s, v) => s + Number(v.valor || 0), 0)
  const vendasMes = (vendas ?? []).filter(v => v.created_at >= inicioMes).length

  const resumoClientes = insights.map(i => {
    const nome = clienteMap.get(i.cliente_id) ?? 'Desconhecido'
    return `${nome} | ${i.classificacao} | R$${Number(i.total_gasto).toFixed(0)} | ${i.qtd_compras}x | ${i.dias_sem_comprar ?? '?'}d sem comprar | marcas: ${(i.marcas_favoritas as string[] ?? []).join(', ')} | tam: ${(i.tamanhos as string[] ?? []).join(', ')}`
  }).join('\n')

  const resumoEstoque = estoqueDisponivel.slice(0, 60).map(e => {
    const tam = (e.tamanhos as TamanhoItem[]).filter(t => t.qtd > 0)
    return `${e.nome}${e.cor ? ` ${e.cor}` : ''} (${e.marca ?? '?'}) | ${tam.map(t => `${t.tamanho}:${t.qtd}`).join(' ')} | R$${Number(e.preco_venda).toFixed(0)}`
  }).join('\n')

  const nomeLoja = config?.nome_loja ?? 'loja'

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Você é o agente de inteligência de negócios da ${nomeLoja}, loja de roupas.
Analise os dados e gere 3 a 5 sugestões PROATIVAS e CRIATIVAS para o dono.

FATURAMENTO DO MÊS: R$${faturamentoMes.toFixed(2)} (${vendasMes} vendas)

CLIENTES (nome | classificação | total gasto | qtd compras | dias sem comprar | marcas | tamanhos):
${resumoClientes}

ESTOQUE DISPONÍVEL:
${resumoEstoque}

Pense como gerente de vendas experiente. Sugestões de: reconhecimento VIP, reativação, cruzamento estoque x cliente, brindes, cross-sell.

JSON:
{"sugestoes":[{"tipo":"vip|reativacao|campanha|brinde|cross_sell|oportunidade","titulo":"título curto","descricao":"raciocínio claro","prioridade":1,"acao":{"tipo":"campanha|mensagem_individual|alerta","clientes":["nome"],"sugestao_mensagem":"mensagem sugerida"}}]}`
    }],
  })

  const text = (res.content[0] as { text: string }).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ ok: false, erro: 'IA não retornou JSON' })

  const { sugestoes } = JSON.parse(jsonMatch[0])

  await admin.from('agente_sugestoes').delete().eq('user_id', userId).eq('status', 'pendente')

  const rows = (sugestoes ?? []).map((s: { tipo: string; titulo: string; descricao: string; prioridade: number; acao: unknown }) => ({
    user_id: userId, tipo: s.tipo, titulo: s.titulo, descricao: s.descricao,
    prioridade: s.prioridade ?? 2, acao: s.acao ?? null, status: 'pendente',
  }))

  if (rows.length > 0) await admin.from('agente_sugestoes').insert(rows)

  return NextResponse.json({ ok: true, sugestoes: rows.length, clientes_analisados: insights.length })
}
