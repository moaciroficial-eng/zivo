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
    .from('metas').select('valor_meta')
    .eq('user_id', user.id).eq('mes', mes).single()

  if (!metaRow) return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })

  const { start, end } = getMesRange(mes)

  const [vendasRes, estoqueRes, clientesRes, ultimasVendasRes] = await Promise.all([
    supabase.from('vendas').select('valor').eq('user_id', user.id)
      .gte('data_venda', start).lt('data_venda', end),
    supabase.from('estoque').select('id, nome, marca, preco_venda, created_at')
      .eq('user_id', user.id).eq('status', 'disponivel')
      .not('preco_venda', 'is', null)
      .order('preco_venda', { ascending: false }).limit(25),
    supabase.from('clientes').select('id, nome, telefone, data_nascimento')
      .eq('user_id', user.id).limit(30),
    supabase.from('vendas').select('cliente_id, data_venda')
      .eq('user_id', user.id).not('cliente_id', 'is', null)
      .order('data_venda', { ascending: false }).limit(500),
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

  const produtos = (estoqueRes.data ?? []).map(p => ({
    id:              p.id,
    nome:            p.nome + (p.marca ? ` (${p.marca})` : ''),
    preco_venda:     p.preco_venda,
    dias_em_estoque: Math.floor((todayMs - new Date(p.created_at).getTime()) / 86400000),
  }))

  const clientes = (clientesRes.data ?? [])
    .map(c => {
      const ultima       = ultimaCompra.get(c.id)
      const diasSemComp  = ultima
        ? Math.floor((todayMs - new Date(ultima).getTime()) / 86400000)
        : null
      return { id: c.id, nome: c.nome, telefone: c.telefone ?? null, dias_sem_comprar: diasSemComp, data_nascimento: c.data_nascimento ?? null }
    })
    .sort((a, b) => (b.dias_sem_comprar ?? 9999) - (a.dias_sem_comprar ?? 9999))

  const meta       = Number(metaRow.valor_meta)
  const pct        = meta > 0 ? Math.round((vendido / meta) * 100) : 0
  const mediaDiaria = diasRest.length > 0 ? (restante / diasRest.length) : 0

  const statusMsg  = restante > meta * 0.6
    ? '⚠️ ATRÁS DA META — intensifique as ações!'
    : restante < meta * 0.15
    ? '🎯 QUASE LÁ — mantenha o ritmo!'
    : ''

  const prompt = `Você é um assistente de vendas para uma loja de roupas/calçados no Brasil. Gere um plano de vendas diário personalizado em JSON.

META DO MÊS (${mes}): R$ ${meta.toFixed(2)}
Vendido até hoje (${hoje}): R$ ${vendido.toFixed(2)} (${pct}%)
Restante: R$ ${restante.toFixed(2)} em ${diasRest.length} dia${diasRest.length !== 1 ? 's' : ''}
Média diária necessária: R$ ${mediaDiaria.toFixed(2)}
${statusMsg}

PRODUTOS EM ESTOQUE (${produtos.length} itens):
${produtos.map(p =>
  `- ID:${p.id} | ${p.nome} | R$ ${Number(p.preco_venda).toFixed(2)} | ${p.dias_em_estoque}d em estoque`
).join('\n')}

CLIENTES (${clientes.length} cadastrados, ordenados por tempo sem comprar):
${clientes.slice(0, 20).map(c =>
  `- ID:${c.id} | ${c.nome} | Tel:${c.telefone ?? 'sem tel'} | ${c.dias_sem_comprar !== null ? `${c.dias_sem_comprar}d sem comprar` : 'nunca comprou'}${c.data_nascimento ? ` | Nasc:${c.data_nascimento}` : ''}`
).join('\n')}

DIAS RESTANTES: ${diasRest.map(d => `${d.data}(${d.diaSemana})`).join(', ')}

REGRAS OBRIGATÓRIAS:
1. Sáb e Dom devem ter meta_dia ~40% maior que dias úteis da mesma semana
2. Produtos com ≤14 dias em estoque → estrategia "preco_cheio"
3. Produtos com ≥30 dias em estoque → estrategia "desconto", desconto_sugerido entre 10-20
4. Máximo 3 produtos e 2 clientes por dia; varie as sugestões dia a dia
5. Se atrás da meta (>60% restante): metas diárias agressivas, priorize descontos
6. Distribua todos os clientes ao longo dos dias, priorizando os que não compram há mais tempo
7. dica deve ser prática e específica para aquele dia da semana (ex: "Segunda: ligue para os 2 clientes listados antes das 11h")

Responda APENAS com JSON válido (sem markdown, sem explicações):
{
  "resumo": {
    "meta": number,
    "vendido": number,
    "restante": number,
    "percentual": number,
    "dias_restantes": number,
    "media_diaria_necessaria": number
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
          "motivo": "string curto"
        }
      ],
      "clientes_contatar": [
        {
          "cliente_id": "uuid",
          "nome": "string",
          "telefone": "string | null",
          "motivo": "string curto"
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
    return NextResponse.json({ error: 'JSON inválido da IA' }, { status: 500 })
  }

  await supabase.from('metas').update({
    plano,
    plano_gerado_em:    new Date().toISOString(),
    plano_vendido_base: vendido,
  }).eq('user_id', user.id).eq('mes', mes)

  return NextResponse.json({ plano })
}
