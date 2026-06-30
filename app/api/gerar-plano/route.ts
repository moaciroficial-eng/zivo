import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

function getMesRange(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const end    = new Date(y, m, 1)
  const pad    = (n: number) => String(n).padStart(2, '0')
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
      .eq('user_id', user.id).limit(50),
    supabase.from('vendas').select('cliente_id, data_venda')
      .eq('user_id', user.id).not('cliente_id', 'is', null)
      .order('data_venda', { ascending: false }).limit(150),
  ])

  const vendas   = vendasRes.data ?? []
  const vendido  = vendas.reduce((s, v) => s + Number(v.valor), 0)
  const restante = Math.max(0, Number(metaRow.valor_meta) - vendido)
  const diasRest = getDiasRestantes(mes)
  const hoje     = new Date().toISOString().split('T')[0]
  const todayMs  = Date.now()

  const ultimaCompraMap = new Map<string, string>()
  for (const v of ultimasVendasRes.data ?? []) {
    if (v.cliente_id && !ultimaCompraMap.has(v.cliente_id))
      ultimaCompraMap.set(v.cliente_id, v.data_venda)
  }

  const produtos = (estoqueRes.data ?? []).map(p => {
    const pv     = Number(p.preco_venda)
    const pc     = p.preco_custo != null ? Number(p.preco_custo) : null
    const margem = pc != null && pv > 0 ? Math.round(((pv - pc) / pv) * 100) : null
    return {
      id:              p.id,
      nome:            p.nome + (p.marca ? ` (${p.marca})` : ''),
      marca:           (p.marca as string | null) ?? null,
      preco_venda:     pv,
      preco_custo:     pc,
      margem_pct:      margem,
      dias_em_estoque: Math.floor((todayMs - new Date(p.created_at).getTime()) / 86400000),
    }
  })

  const clientes = (clientesRes.data ?? [])
    .map(c => {
      const ultima      = ultimaCompraMap.get(c.id)
      const diasSemComp = ultima ? Math.floor((todayMs - new Date(ultima).getTime()) / 86400000) : null
      return { id: c.id, nome: c.nome, telefone: c.telefone ?? null, dias_sem_comprar: diasSemComp, data_nascimento: c.data_nascimento ?? null }
    })
    .filter(c => c.dias_sem_comprar !== null)
    .sort((a, b) => (b.dias_sem_comprar ?? 0) - (a.dias_sem_comprar ?? 0))

  /* ── Busca insights para cruzamento inteligente ─────────── */
  type InsightRow = {
    cliente_id: string
    marcas_favoritas: string[] | null
    tamanhos: string[] | null
    ticket_medio: number | null
    tendencia: string | null
    ritmo_compra_dias: number | null
    mes_pico: string | null
    gift_buyer_score: number | null
  }

  const insightsData = clientes.length > 0
    ? ((await supabase.from('contato_insights')
        .select('cliente_id, marcas_favoritas, tamanhos, ticket_medio, tendencia, ritmo_compra_dias, mes_pico, gift_buyer_score')
        .eq('user_id', user.id)
        .in('cliente_id', clientes.map(c => c.id))).data ?? []) as InsightRow[]
    : [] as InsightRow[]

  const insightsMap = new Map<string, InsightRow>(insightsData.map(i => [i.cliente_id, i]))

  /* ── Aniversários nos próximos 14 dias ──────────────────── */
  const todayDate = new Date()
  const aniversariosProximos = (clientesRes.data ?? [])
    .filter(c => c.data_nascimento)
    .map(c => {
      const parts = (c.data_nascimento as string).split('-').map(Number)
      const mes2 = parts[1], dia = parts[2]
      const aniv = new Date(todayDate.getFullYear(), mes2 - 1, dia)
      if (aniv < todayDate) aniv.setFullYear(todayDate.getFullYear() + 1)
      const dias = Math.round((aniv.getTime() - todayDate.getTime()) / 86400000)
      return { nome: c.nome as string, dias, dia, mes: mes2 }
    })
    .filter(a => a.dias >= 0 && a.dias <= 14)
    .sort((a, b) => a.dias - b.dias)

  /* ── Cruzamentos estoque × perfil ──────────────────────── */
  const cruzamentos: string[] = []
  for (const prod of produtos) {
    if (!prod.marca) continue
    for (const cl of clientes.slice(0, 20)) {
      const ins = insightsMap.get(cl.id)
      if (!ins?.marcas_favoritas?.length) continue
      const gostaDaMarca = ins.marcas_favoritas.some(m => m.toLowerCase() === prod.marca!.toLowerCase())
      if (!gostaDaMarca) continue
      const tamInfo = ins.tamanhos?.length ? `(${ins.tamanhos.join(', ')})` : ''
      const urgStr  = ins.tendencia === 'desaparecendo' ? ' ⚠️ SUMINDO' : ins.tendencia === 'esfriando' ? ' esfriando' : ''
      cruzamentos.push(`• ${prod.nome} → ${cl.nome} ${tamInfo} | ${cl.dias_sem_comprar}d sem comprar${urgStr}`)
    }
  }

  /* ── Dados financeiros ──────────────────────────────────── */
  const meta        = Number(metaRow.valor_meta)
  const pct         = meta > 0 ? Math.round((vendido / meta) * 100) : 0
  const statusMsg   = restante > meta * 0.6 ? '⚠️ ATRÁS DA META' : restante < meta * 0.15 ? '🎯 QUASE LÁ' : ''
  const despesas    = metaRow.despesas_fixas_mensais ? Number(metaRow.despesas_fixas_mensais) : null
  const dividasTot  = metaRow.dividas_atuais         ? Number(metaRow.dividas_atuais)         : null
  const capitalGiro = metaRow.capital_de_giro        ? Number(metaRow.capital_de_giro)        : null
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
      if (dividasTot === 0)                                    score += 2
      else if (capitalGiro && dividasTot < capitalGiro * 0.3)  score += 1
      else if (capitalGiro && dividasTot < capitalGiro)        score += 0
      else                                                     score -= 2
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
8. JAMAIS sugerir preco_com_desconto abaixo do preco_custo do produto
9. Margem mínima em qualquer desconto: pelo menos 15% acima do custo
${healthStatus === 'critico' ? '10. EMPRESA CRÍTICA: priorize margem; desconto máximo 8%; foque maior margem' : ''}
${healthStatus === 'atencao' ? '10. Empresa com atenção financeira: desconto só em produtos parados >45 dias; máx 12%' : ''}
${healthStatus === 'saudavel' ? '10. Empresa saudável: descontos estratégicos em antigos (até 20%), respeitando margem mínima' : ''}
11. Meta mínima para cobrir despesas: R$ ${despesas.toFixed(2)}/mês (R$ ${pontoEqDia?.toFixed(2)}/dia)` : `
REGRAS FINANCEIRAS:
8. JAMAIS sugerir preco_com_desconto abaixo do preco_custo do produto`

  const diasPlano         = diasRest.slice(0, 14)
  const precoMedio        = produtos.length > 0 ? produtos.reduce((s, p) => s + p.preco_venda, 0) / produtos.length : 0
  const vendasNecessarias = precoMedio > 0 ? Math.ceil(restante / precoMedio) : 0

  /* ── Monta string enriquecida de clientes ───────────────── */
  const clientesStr = clientes.slice(0, 20).map(c => {
    const ins    = insightsMap.get(c.id)
    const partes = [
      `ID:${c.id}`,
      c.nome,
      `Tel:${c.telefone ?? 'sem tel'}`,
      c.dias_sem_comprar !== null ? `${c.dias_sem_comprar}d sem comprar` : 'nunca comprou',
    ]
    if (ins?.marcas_favoritas?.length)                        partes.push(`Marcas: ${ins.marcas_favoritas.join(', ')}`)
    if (ins?.tamanhos?.length)                                partes.push(`Tam: ${ins.tamanhos.join(', ')}`)
    if (ins?.ticket_medio)                                    partes.push(`Ticket: R$${Math.round(ins.ticket_medio)}`)
    if (ins?.tendencia)                                       partes.push(`Tendência: ${ins.tendencia}`)
    if (ins?.gift_buyer_score && ins.gift_buyer_score > 40)   partes.push('Comprador de presentes')
    if (c.data_nascimento)                                    partes.push(`Nasc: ${c.data_nascimento}`)
    return `- ${partes.join(' | ')}`
  }).join('\n')

  const cruzamentosStr = cruzamentos.length > 0
    ? `\nCRUZAMENTOS DETECTADOS (PRIORIZE esses nos dias certos):\n${cruzamentos.slice(0, 8).join('\n')}\n`
    : ''

  const aniversariosStr = aniversariosProximos.length > 0
    ? `\nANIVERSÁRIOS PRÓXIMOS (14 dias):\n${aniversariosProximos.map(a =>
        `- ${a.nome}: em ${a.dias === 0 ? 'HOJE' : `${a.dias} dias`} (${a.dia}/${a.mes})`
      ).join('\n')}\n`
    : ''

  const prompt = `Você é o sócio mais experiente de uma loja de roupas/calçados no Brasil. Fala direto, sem frescura, como um sócio honesto falaria no dia a dia — nem robotizado, nem motivacional vazio.

META DO MÊS (${mes}): R$ ${meta.toFixed(2)}
Vendido até hoje (${hoje}): R$ ${vendido.toFixed(2)} (${pct}%)
Restante: R$ ${restante.toFixed(2)}
${statusMsg}
${saudeLine}
${cruzamentosStr}${aniversariosStr}
PRODUTOS EM ESTOQUE (${produtos.length} itens disponíveis):
${produtos.map(p => {
  const custoStr  = p.preco_custo != null ? ` | custo: R$ ${p.preco_custo.toFixed(2)}` : ''
  const margemStr = p.margem_pct  != null ? ` | margem: ${p.margem_pct}%` : ''
  return `- ID:${p.id} | ${p.nome} | preço: R$ ${p.preco_venda.toFixed(2)}${custoStr}${margemStr} | ${p.dias_em_estoque}d em estoque`
}).join('\n')}

CLIENTES (ordenados por tempo sem comprar, com perfil completo):
${clientesStr}

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

SOBRE CLIENTES (use o perfil para conectar produto certo ao cliente certo):
- Cliente com a marca do produto em "Marcas" → alvo PRIORITÁRIO para esse produto
- Cruzamentos já detectados acima → inclua obrigatoriamente esses clientes nos dias correspondentes
- Tendência "esfriando" ou "desaparecendo" → prioridade máxima de contato esta semana
- "Comprador de presentes" → abordar em datas comemorativas ou quando chegar item presente
- Aniversário nos próximos dias → oportunidade de contato personalizado
- mensagem_whatsapp: mensagem natural, mencione o produto específico e o motivo real do contato
- Máximo 1 cliente por dia.
${regraFinanceira}

Responda APENAS com JSON válido (sem markdown, sem explicações):
{
  "comentario_socio": "2-3 frases naturais e honestas sobre a situação atual da meta. Fale como sócio — sem emojis de status, sem 'intensifique as ações'. Se a meta tá difícil, diz. Se tá tranquila, diz. Ex: 'Você tá em 67% com 10 dias ainda, tá no caminho certo. Mas sua média diária de R$280 precisa subir pra R$330 pra fechar. Foca nos clientes que não aparecem há mais de 20 dias.'",
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
    console.error('JSON parse failed:', responseText.slice(0, 300), '...', responseText.slice(-200))
    return NextResponse.json({ error: 'JSON inválido da IA' }, { status: 500 })
  }

  await supabase.from('metas').update({
    plano,
    plano_gerado_em:    new Date().toISOString(),
    plano_vendido_base: vendido,
  }).eq('user_id', user.id).eq('mes', mes)

  return NextResponse.json({ plano })
}
