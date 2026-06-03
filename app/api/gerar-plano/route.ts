import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

function getMesRange(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end   = new Date(y, m, 1)
  const pad   = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${y}-${pad(m)}-01`,
    end:   `${end.getFullYear()}-${pad(end.getMonth() + 1)}-01`,
  }
}

function getDiasRestantes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const nomes  = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const hoje   = new Date(); hoje.setHours(0, 0, 0, 0)
  const ultimo = new Date(y, m, 0).getDate()
  const dias: { data: string; diaSemana: string }[] = []

  for (let d = 1; d <= ultimo; d++) {
    const dt = new Date(y, m - 1, d)
    if (dt >= hoje) {
      dias.push({
        data:      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        diaSemana: nomes[dt.getDay()],
      })
    }
  }
  return dias
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { mes } = body as { mes?: string }
  if (!mes) return NextResponse.json({ error: 'mes required' }, { status: 400 })

  const { data: metaRow } = await supabase
    .from('metas')
    .select('valor_meta, dividas_atuais, despesas_fixas_mensais, capital_de_giro')
    .eq('user_id', user.id).eq('mes', mes).single()

  if (!metaRow) return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })

  const { start, end } = getMesRange(mes)

  const [vendasRes, estoqueRes, clientesRes, ultimasVendasRes] = await Promise.all([
    supabase.from('vendas').select('valor').eq('user_id', user.id)
      .gte('data_venda', start).lt('data_venda', end),
    supabase.from('estoque').select('id, nome, marca, preco_venda, preco_custo, created_at, status')
      .eq('user_id', user.id)
      .not('preco_venda', 'is', null)
      .not('status', 'eq', 'vendido')
      .order('preco_venda', { ascending: false }).limit(20),
    supabase.from('clientes').select('id, nome, telefone, data_nascimento')
      .eq('user_id', user.id).limit(20),
    supabase.from('vendas').select('cliente_id, data_venda')
      .eq('user_id', user.id).not('cliente_id', 'is', null)
      .order('data_venda', { ascending: false }).limit(150),
  ])

  const vendas    = vendasRes.data   ?? []
  const vendido   = vendas.reduce((s, v) => s + Number(v.valor), 0)
  const restante  = Math.max(0, Number(metaRow.valor_meta) - vendido)
  const diasRest  = getDiasRestantes(mes)
  const hoje      = new Date().toISOString().split('T')[0]
  const todayMs   = Date.now()

  const ultimaCompra = new Map<string, string>()
  for (const v of ultimasVendasRes.data ?? []) {
    if (v.cliente_id && !ultimaCompra.has(v.cliente_id))
      ultimaCompra.set(v.cliente_id, v.data_venda)
  }

  const produtos = (estoqueRes.data ?? []).map(p => {
    const pv    = Number(p.preco_venda)
    const pc    = p.preco_custo != null ? Number(p.preco_custo) : null
    const margem = pc != null && pv > 0 ? Math.round(((pv - pc) / pv) * 100) : null
    return {
      id:              p.id,
      nome:            p.nome + (p.marca ? ` (${p.marca})` : ''),
      preco_venda:     pv,
      preco_custo:     pc,
      margem_pct:      margem,
      dias_em_estoque: Math.floor((todayMs - new Date(p.created_at).getTime()) / 86400000),
    }
  })

  const clientes = (clientesRes.data ?? [])
    .map(c => {
      const ultima       = ultimaCompra.get(c.id)
      const diasSemComp  = ultima
        ? Math.floor((todayMs - new Date(ultima).getTime()) / 86400000)
        : null
      return { id: c.id, nome: c.nome, telefone: c.telefone ?? null, dias_sem_comprar: diasSemComp, data_nascimento: c.data_nascimento ?? null }
    })
    // Só clientes com histórico de compra — "nunca comprou" não tem base para sugestão
    .filter(c => c.dias_sem_comprar !== null)
    .sort((a, b) => (b.dias_sem_comprar ?? 0) - (a.dias_sem_comprar ?? 0))

  const meta        = Number(metaRow.valor_meta)
  const pct         = meta > 0 ? Math.round((vendido / meta) * 100) : 0
  const mediaDiaria = diasRest.length > 0 ? (restante / diasRest.length) : 0

  const statusMsg = restante > meta * 0.6
    ? '⚠️ ATRÁS DA META — intensifique as ações!'
    : restante < meta * 0.15
    ? '🎯 QUASE LÁ — mantenha o ritmo!'
    : ''

  // Financial health context
  const despesas   = metaRow.despesas_fixas_mensais ? Number(metaRow.despesas_fixas_mensais) : null
  const dividasTot = metaRow.dividas_atuais         ? Number(metaRow.dividas_atuais)         : null
  const capitalGiro = metaRow.capital_de_giro       ? Number(metaRow.capital_de_giro)        : null
  const diasNoMes   = new Date(Number(mes.split('-')[0]), Number(mes.split('-')[1]), 0).getDate()
  const pontoEqDia  = despesas ? despesas / diasNoMes : null

  let healthStatus: 'saudavel' | 'atencao' | 'critico' | null = null
  if (despesas != null) {
    let score = 0
    if (capitalGiro != null) {
      if (capitalGiro >= despesas * 2) score += 2
      else if (capitalGiro >= despesas) score += 1
      else score -= 1
    }
    if (dividasTot != null) {
      if (dividasTot === 0)                                      score += 2
      else if (capitalGiro && dividasTot < capitalGiro * 0.3)    score += 1
      else if (capitalGiro && dividasTot < capitalGiro)          score += 0
      else                                                        score -= 2
    }
    healthStatus = score >= 3 ? 'saudavel' : score >= 0 ? 'atencao' : 'critico'
  }

  const saudeLine = despesas != null ? `
SAÚDE FINANCEIRA DA EMPRESA:
- Despesas fixas mensais: R$ ${despesas.toFixed(2)} (ponto de equilíbrio = R$ ${pontoEqDia?.toFixed(2)}/dia)
- Dívidas totais: R$ ${dividasTot?.toFixed(2) ?? '0.00'}
- Capital de giro disponível: R$ ${capitalGiro?.toFixed(2) ?? '0.00'}
- Status financeiro: ${healthStatus === 'saudavel' ? 'SAUDÁVEL' : healthStatus === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO'}` : ''

  const regraFinanceira = despesas != null ? `
REGRAS FINANCEIRAS (INVIOLÁVEIS):
8. JAMAIS sugerir preco_com_desconto abaixo do preco_custo do produto — venda abaixo do custo é proibida
9. Margem mínima em qualquer desconto: pelo menos 15% acima do custo (se custo conhecido)
${healthStatus === 'critico' ? '10. EMPRESA EM SITUAÇÃO CRÍTICA: priorize MARGEM sobre volume; desconto máximo de 8%; foque apenas nos produtos de maior margem; nunca liquide estoque para caixa de curto prazo' : ''}
${healthStatus === 'atencao' ? '10. Empresa com dívidas/atenção financeira: equilibre margem e volume; descontos apenas em produtos parados há mais de 45 dias; máximo 12% de desconto' : ''}
${healthStatus === 'saudavel' ? '10. Empresa saudável: pode usar descontos estratégicos em produtos antigos (até 20%), mas sempre respeite a margem mínima de 15%' : ''}
11. A meta mínima real para cobrir despesas é R$ ${despesas.toFixed(2)}/mês (R$ ${pontoEqDia?.toFixed(2)}/dia) — meta abaixo disso é prejuízo operacional` : `
REGRAS FINANCEIRAS:
8. JAMAIS sugerir preco_com_desconto abaixo do preco_custo do produto`

  const diasPlano = diasRest.slice(0, 14)
  const precoMedio = produtos.length > 0
    ? produtos.reduce((s, p) => s + p.preco_venda, 0) / produtos.length
    : 0
  const vendasNecessarias = precoMedio > 0 ? Math.ceil(restante / precoMedio) : 0

  const prompt = `Você é um assistente de vendas para uma loja de roupas/calçados no Brasil.

META DO MÊS (${mes}): R$ ${meta.toFixed(2)}
Vendido até hoje (${hoje}): R$ ${vendido.toFixed(2)} (${pct}%)
Restante: R$ ${restante.toFixed(2)}
${statusMsg}
${saudeLine}

PRODUTOS EM ESTOQUE (${produtos.length} itens disponíveis):
${produtos.map(p => {
  const custoStr = p.preco_custo != null ? ` | custo: R$ ${p.preco_custo.toFixed(2)}` : ''
  const margemStr = p.margem_pct != null ? ` | margem: ${p.margem_pct}%` : ''
  return `- ID:${p.id} | ${p.nome} | preço: R$ ${p.preco_venda.toFixed(2)}${custoStr}${margemStr} | ${p.dias_em_estoque}d em estoque`
}).join('\n')}

CLIENTES (ordenados por tempo sem comprar):
${clientes.slice(0, 20).map(c =>
  `- ID:${c.id} | ${c.nome} | Tel:${c.telefone ?? 'sem tel'} | ${c.dias_sem_comprar !== null ? `${c.dias_sem_comprar}d sem comprar` : 'nunca comprou'}${c.data_nascimento ? ` | Nasc:${c.data_nascimento}` : ''}`
).join('\n')}

DIAS DO PLANO: ${diasPlano.map(d => `${d.data}(${d.diaSemana})`).join(', ')}

COMO PENSAR O PLANO:
- NÃO divida a meta pelo número de dias. Pense em vendas reais com produtos do estoque.
- Estime quantas vendas são necessárias: R$ ${restante.toFixed(2)} ÷ preço médio R$ ${precoMedio.toFixed(2)} ≈ ${vendasNecessarias} vendas.
- meta_dia = soma dos preços dos produtos sugeridos para aquele dia.
- Varie os produtos dia a dia — não repita a mesma peça em dias consecutivos.
- Seja CONCISO: motivo e dica com no máximo 60 caracteres.

REGRA PRINCIPAL — PRODUTOS SÃO OBRIGATÓRIOS:
- SE HÁ PRODUTOS NO ESTOQUE, todo dia do plano DEVE ter pelo menos 1 produto sugerido. Sem exceção.
- Sáb/Dom: 2 produtos (mais movimento); dias úteis: 1 produto mínimo.
- NUNCA deixe produtos_priorizar = [] quando há estoque disponível acima.
- Produtos com ≤14 dias em estoque → estrategia "preco_cheio"
- Produtos com ≥30 dias em estoque → estrategia "desconto"

SOBRE CLIENTES (secundário):
- Clientes só aparecem quando há histórico de compra (os da lista já foram filtrados — todos já compraram antes).
- Só inclua um cliente se o motivo for específico para o produto do dia (ex: "comprou essa marca antes").
- Se não houver conexão com o produto, deixe clientes_contatar = [].
- mensagem_whatsapp: mensagem curta em português para enviar sobre o produto do dia. Ex: "Oi [nome]! Temos uma peça incrível: [produto] por R$ XX. Que tal dar uma olhada?"
- Máximo 1 cliente por dia.
${regraFinanceira}

Responda APENAS com JSON válido (sem markdown, sem explicações):
{
  "resumo": {
    "meta": number,
    "vendido": number,
    "restante": number,
    "percentual": number,
    "dias_restantes": number,
    "vendas_necessarias": number
  },
  "dias": [
    {
      "data": "YYYY-MM-DD",
      "dia_semana": "Seg|Ter|Qua|Qui|Sex|Sáb|Dom",
      "meta_dia": number,
      "produtos_priorizar": [
        {
          "produto_id": "uuid",
          "nome": "string",
          "preco_venda": number,
          "estrategia": "preco_cheio" | "desconto",
          "desconto_sugerido": number | null,
          "preco_com_desconto": number | null,
          "motivo": "string curto",
          "vendido": false
        }
      ],
      "clientes_contatar": [
        {
          "cliente_id": "uuid",
          "nome": "string",
          "telefone": "string | null",
          "motivo": "string curto",
          "mensagem_whatsapp": "string — mensagem natural para enviar pelo WhatsApp sobre o produto do dia"
        }
      ],
      "dica": "string"
    }
  ]
}`

  let responseText = ''
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
      system:     'Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois.',
      messages:   [{ role: 'user', content: prompt }],
    })
    responseText = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (err) {
    console.error('Anthropic error:', err)
    return NextResponse.json({ error: 'Erro ao chamar IA' }, { status: 502 })
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ error: 'Resposta inválida da IA' }, { status: 500 })

  let plano: unknown
  try {
    plano = JSON.parse(jsonMatch[0])
  } catch {
    console.error('JSON parse failed. Response snippet:', responseText.slice(0, 300), '...', responseText.slice(-200))
    return NextResponse.json({ error: 'JSON inválido da IA' }, { status: 500 })
  }

  await supabase.from('metas').update({
    plano,
    plano_gerado_em:    new Date().toISOString(),
    plano_vendido_base: vendido,
  }).eq('user_id', user.id).eq('mes', mes)

  return NextResponse.json({ plano })
}
