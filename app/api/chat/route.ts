import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const anthropic = new Anthropic()

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { messages } = await request.json()
  const today = new Date().toISOString().slice(0, 10)
  const anoAtual = new Date().getFullYear()
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0')

  /* Carrega TUDO sem limite */
  const [
    { data: todasVendas },
    { data: todosClientes },
    { data: estoque },
    { data: eventos },
    { data: config },
  ] = await Promise.all([
    admin.from('vendas').select('id,cliente_id,cliente_nome,valor,data_venda,produtos,forma_pagamento,presente,tipo_presente').eq('user_id', user.id).order('data_venda', { ascending: false }),
    admin.from('clientes').select('id,nome,telefone,tamanho_camiseta,tamanho_calca,tamanho_tenis,data_nascimento,observacoes').eq('user_id', user.id),
    admin.from('estoque').select('id,nome,marca,categoria,tamanhos,preco_custo,preco_venda,data_entrada').eq('user_id', user.id),
    admin.from('eventos').select('nome,data,descricao').eq('user_id', user.id).order('data', { ascending: true }).limit(30),
    admin.from('loja_config').select('nome_loja,horario,info_extra').eq('user_id', user.id).maybeSingle(),
  ])

  /* Agrega vendas por mês */
  const vendasPorMes: Record<string, { total: number; qtd: number }> = {}
  for (const v of todasVendas ?? []) {
    const mes = (v.data_venda as string).slice(0, 7)
    if (!vendasPorMes[mes]) vendasPorMes[mes] = { total: 0, qtd: 0 }
    vendasPorMes[mes].total += Number(v.valor)
    vendasPorMes[mes].qtd++
  }

  /* Top clientes por valor */
  const gastoCliente: Record<string, number> = {}
  for (const v of todasVendas ?? []) {
    const key = v.cliente_nome
    gastoCliente[key] = (gastoCliente[key] ?? 0) + Number(v.valor)
  }
  const topClientes = Object.entries(gastoCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([nome, total]) => `${nome}: R$${total.toFixed(0)}`)

  /* Produtos mais vendidos */
  const qtdProduto: Record<string, number> = {}
  for (const v of todasVendas ?? []) {
    for (const p of (v.produtos ?? []) as { nome?: string; qtd?: number }[]) {
      if (p.nome) qtdProduto[p.nome] = (qtdProduto[p.nome] ?? 0) + (p.qtd ?? 1)
    }
  }
  const topProdutos = Object.entries(qtdProduto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([nome, qtd]) => `${nome}: ${qtd}un`)

  /* Vendas do mês atual */
  const vendasMesAtual = (todasVendas ?? []).filter(v => (v.data_venda as string).startsWith(`${anoAtual}-${mesAtual}`))
  const faturamentoMes = vendasMesAtual.reduce((s, v) => s + Number(v.valor), 0)

  /* Vendas recentes (últimas 30) para contexto detalhado */
  const vendasRecentes = (todasVendas ?? []).slice(0, 30).map(v =>
    `${v.data_venda} | ${v.cliente_nome} | R$${Number(v.valor).toFixed(0)} | ${v.forma_pagamento ?? ''}${v.presente ? ` | PRESENTE (${v.tipo_presente ?? ''})` : ''}`
  )

  type TamanhoItem = { tamanho: string; qtd: number }
  const estoqueResumo = (estoque ?? []).map(e => {
    const tam = ((e.tamanhos as TamanhoItem[]) ?? []).filter(t => t.qtd > 0)
    const total = tam.reduce((s, t) => s + t.qtd, 0)
    const diasNoEstoque = e.data_entrada ? Math.floor((Date.now() - new Date(e.data_entrada as string).getTime()) / 86400000) : null
    return `${e.nome}${e.marca ? ` (${e.marca})` : ''} | ${total}un | ${tam.map(t => `${t.tamanho}:${t.qtd}`).join(' ')}${diasNoEstoque ? ` | ${diasNoEstoque}d no estoque` : ''} | R$${e.preco_venda ?? '?'}`
  })

  const totalReceita = (todasVendas ?? []).reduce((s, v) => s + Number(v.valor), 0)

  const system = `Você é o sócio virtual do ${config?.nome_loja ?? 'Moca'}, dono de loja de roupas em Barreiras-BA. Analisa dados reais da loja e age como sócio honesto e experiente.

Hoje é ${today}.

## DADOS COMPLETOS DA LOJA

### Receita total histórica: R$${totalReceita.toFixed(0)} | ${todasVendas?.length ?? 0} vendas registradas

### Faturamento por mês:
${Object.entries(vendasPorMes).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 24).map(([mes, d]) => `${mes}: R$${d.total.toFixed(0)} (${d.qtd} vendas)`).join('\n')}

### Mês atual (${anoAtual}-${mesAtual}): R$${faturamentoMes.toFixed(0)} — ${vendasMesAtual.length} vendas

### Top 20 clientes por valor gasto:
${topClientes.join('\n')}

### Produtos mais vendidos:
${topProdutos.join('\n')}

### Últimas 30 vendas:
${vendasRecentes.join('\n')}

### Clientes cadastrados (${todosClientes?.length ?? 0}):
${(todosClientes ?? []).map(c => `${c.nome} | cam:${c.tamanho_camiseta ?? '?'} cal:${c.tamanho_calca ?? '?'} ten:${c.tamanho_tenis ?? '?'} | nasc:${c.data_nascimento ?? '?'}`).join('\n')}

### Estoque (${estoque?.length ?? 0} produtos):
${estoqueResumo.join('\n')}

### Calendário:
${(eventos ?? []).map(e => `${e.data}: ${e.nome}${e.descricao ? ` — ${e.descricao}` : ''}`).join('\n')}

${config?.info_extra ? `### Info da loja:\n${config.info_extra}` : ''}

## Regras
1. Responda SEMPRE com base nos dados reais acima — nunca invente números
2. Quando perguntarem sobre vendas, clientes ou estoque, use os dados completos acima
3. Seja direto — se um produto encalhou, fala; se a meta tá em risco, alerta
4. Use a ferramenta buscar_vendas quando precisar de detalhes que não estão no resumo
5. Use a ferramenta create_event para criar eventos no calendário
6. Responda em português informal, como um sócio falaria
7. Considere a realidade regional de Barreiras-BA: São João, clima do sertão, festas locais`

  const tools: Anthropic.Tool[] = [
    {
      name: 'create_event',
      description: 'Cria um evento no calendário da loja.',
      input_schema: {
        type: 'object' as const,
        properties: {
          nome: { type: 'string', description: 'Nome do evento' },
          data: { type: 'string', description: `Data YYYY-MM-DD. Hoje: ${today}` },
          descricao: { type: 'string', description: 'Descrição opcional' },
        },
        required: ['nome', 'data'],
      },
    },
    {
      name: 'buscar_vendas',
      description: 'Busca vendas específicas por período, cliente ou produto. Use quando precisar de detalhes não cobertos pelo resumo.',
      input_schema: {
        type: 'object' as const,
        properties: {
          cliente_nome: { type: 'string', description: 'Nome do cliente para filtrar (parcial)' },
          mes: { type: 'string', description: 'Mês no formato YYYY-MM' },
          produto: { type: 'string', description: 'Nome do produto para filtrar' },
        },
      },
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const systemCached = [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]

      const response1 = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemCached,
        tools,
        messages,
      })

      const toolUseBlocks = response1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

      if (toolUseBlocks.length > 0) {
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === 'create_event') {
            const input = toolUse.input as { nome: string; data: string; descricao?: string }
            const { error } = await supabase.from('eventos').insert({ nome: input.nome, data: input.data, descricao: input.descricao ?? null })
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: error ? `Erro: ${error.message}` : `Evento "${input.nome}" criado para ${input.data}.` })
          }

          if (toolUse.name === 'buscar_vendas') {
            const input = toolUse.input as { cliente_nome?: string; mes?: string; produto?: string }
            let filtradas = todasVendas ?? []
            if (input.cliente_nome) filtradas = filtradas.filter(v => v.cliente_nome?.toLowerCase().includes(input.cliente_nome!.toLowerCase()))
            if (input.mes) filtradas = filtradas.filter(v => (v.data_venda as string).startsWith(input.mes!))
            if (input.produto) filtradas = filtradas.filter(v => (v.produtos as { nome?: string }[] ?? []).some(p => p.nome?.toLowerCase().includes(input.produto!.toLowerCase())))
            const resultado = filtradas.slice(0, 50).map(v => `${v.data_venda} | ${v.cliente_nome} | R$${Number(v.valor).toFixed(0)} | ${JSON.stringify(v.produtos)}`)
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultado.length > 0 ? resultado.join('\n') : 'Nenhuma venda encontrada com esses filtros.' })
          }
        }

        const stream2 = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemCached,
          tools,
          messages: [...messages, { role: 'assistant', content: response1.content }, { role: 'user', content: toolResults }],
        })

        for await (const chunk of stream2) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } else {
        for (const block of response1.content) {
          if (block.type === 'text') controller.enqueue(encoder.encode(block.text))
        }
      }

      controller.close()
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
