import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface ProdutoVenda {
  nome?: string
  marca?: string
  preco_venda?: number
  tamanho?: string
}

interface BrandStat {
  valor: number
  pecas: number
  tamanhos: Record<string, number>
}

interface StockStat {
  valor: number
  pecas: number
  custo: number
  tamanhos: Record<string, number>
}

function formatTam(obj: Record<string, number>): string {
  const total = Object.values(obj).reduce((s, v) => s + v, 0)
  if (total === 0) return 'sem dados'
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${Math.round((v / total) * 100)}%`)
    .join(', ')
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
  const { modo, marca, marcas, periodo, meta_faturamento } = body as {
    modo: 'pedido' | 'meta'
    marca?: string
    marcas?: string[]
    periodo: number
    meta_faturamento?: number
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const since = new Date()
  since.setMonth(since.getMonth() - 6)
  const sinceStr = since.toISOString().split('T')[0]
  const hojeStr  = new Date().toISOString().split('T')[0]

  const [{ data: vendas }, { data: estoque }, { data: clientes }, { data: insights }] = await Promise.all([
    admin.from('vendas')
      .select('id, valor, data_venda, produtos')
      .eq('user_id', user.id)
      .gte('data_venda', sinceStr)
      .order('data_venda'),
    admin.from('estoque')
      .select('id, nome, marca, preco_venda, preco_custo, status, tamanhos')
      .eq('user_id', user.id)
      .neq('status', 'vendido'),
    admin.from('clientes')
      .select('id, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .eq('user_id', user.id),
    admin.from('contato_insights')
      .select('tamanhos')
      .eq('user_id', user.id),
  ])

  /* ── Meses de dados disponíveis ─────────────────────────── */
  const vendaList = vendas ?? []
  const primeiraVenda = vendaList[0]?.data_venda
  const mesesDeDados  = primeiraVenda
    ? Math.max(1, Math.round((new Date(hojeStr).getTime() - new Date(primeiraVenda).getTime()) / (30 * 86400000)))
    : 0
  const mesesAnalisados   = Math.min(mesesDeDados, 6)
  const dadosInsuficientes = mesesAnalisados < 2

  /* ── Vendas por marca ───────────────────────────────────── */
  const brandSales = new Map<string, BrandStat>()
  for (const venda of vendaList) {
    for (const prod of (venda.produtos as ProdutoVenda[]) ?? []) {
      if (!prod.marca) continue
      const s = brandSales.get(prod.marca) ?? { valor: 0, pecas: 0, tamanhos: {} }
      s.valor += prod.preco_venda ?? 0
      s.pecas++
      if (prod.tamanho) s.tamanhos[prod.tamanho] = (s.tamanhos[prod.tamanho] ?? 0) + 1
      brandSales.set(prod.marca, s)
    }
  }

  /* ── Estoque por marca ──────────────────────────────────── */
  const brandStock = new Map<string, StockStat>()
  for (const item of estoque ?? []) {
    if (!item.marca) continue
    const s = brandStock.get(item.marca) ?? { valor: 0, pecas: 0, custo: 0, tamanhos: {} }
    s.valor += Number(item.preco_venda ?? 0)
    s.custo += Number(item.preco_custo ?? 0)
    s.pecas++
    for (const t of (item.tamanhos as { tamanho: string; qtd: number }[]) ?? []) {
      if (t.qtd > 0) s.tamanhos[t.tamanho] = (s.tamanhos[t.tamanho] ?? 0) + t.qtd
    }
    brandStock.set(item.marca, s)
  }

  /* ── Tamanhos dos clientes ──────────────────────────────── */
  const tamCamiseta: Record<string, number> = {}
  const tamCalca:    Record<string, number> = {}
  const tamTenis:    Record<string, number> = {}

  for (const c of clientes ?? []) {
    if (c.tamanho_camiseta) tamCamiseta[c.tamanho_camiseta] = (tamCamiseta[c.tamanho_camiseta] ?? 0) + 1
    if (c.tamanho_calca)    tamCalca[c.tamanho_calca]       = (tamCalca[c.tamanho_calca]       ?? 0) + 1
    if (c.tamanho_tenis)    tamTenis[c.tamanho_tenis]       = (tamTenis[c.tamanho_tenis]       ?? 0) + 1
  }
  for (const ins of insights ?? []) {
    for (const t of (ins.tamanhos as string[]) ?? []) {
      const match = t.match(/^(Camiseta|Cal[çc]a|T[êe]nis):\s*(.+)$/i)
      if (!match) continue
      const cat = match[1].toLowerCase(), tam = match[2].trim()
      // peso 0.5 pois clientes já foram contados acima
      if (cat.includes('camiseta')) tamCamiseta[tam] = (tamCamiseta[tam] ?? 0) + 0.5
      else if (cat.includes('cal')) tamCalca[tam]    = (tamCalca[tam]    ?? 0) + 0.5
      else if (cat.startsWith('t')) tamTenis[tam]    = (tamTenis[tam]    ?? 0) + 0.5
    }
  }

  const totalClientes = Object.values(tamCamiseta).reduce((s, v) => s + Math.round(v), 0)

  /* ── Prompt por modo ────────────────────────────────────── */
  let prompt: string

  if (modo === 'pedido' && marca) {
    const sales = brandSales.get(marca) ?? { valor: 0, pecas: 0, tamanhos: {} }
    const stock = brandStock.get(marca) ?? { valor: 0, pecas: 0, custo: 0, tamanhos: {} }
    const velocMensal    = mesesAnalisados > 0 ? sales.valor / mesesAnalisados : 0
    const coberturaAtual = velocMensal > 0 ? stock.valor / velocMensal : 0
    const necessario     = Math.max(0, velocMensal * periodo - stock.valor)
    const margem         = stock.custo > 0 && stock.valor > 0 ? Math.round(((stock.valor - stock.custo) / stock.valor) * 100) : null
    const tamVendas      = Object.entries(sales.tamanhos).sort((a, b) => b[1] - a[1])

    prompt = `Você é especialista em gestão de compras para lojas de moda no Brasil. Seja direto e prático.

PEDIDO: Marca ${marca} | Período: ${periodo} meses
${dadosInsuficientes ? `⚠️ Apenas ${mesesAnalisados} ${mesesAnalisados === 1 ? 'mês' : 'meses'} de histórico — precisão limitada` : ''}

HISTÓRICO DE VENDAS (últimos ${mesesAnalisados} meses):
- Total vendido: R$${sales.valor.toFixed(2)} | ${sales.pecas} peças
- Velocidade: R$${velocMensal.toFixed(2)}/mês | ${mesesAnalisados > 0 ? (sales.pecas / mesesAnalisados).toFixed(1) : 0} peças/mês
- Tamanhos vendidos: ${tamVendas.length > 0 ? tamVendas.map(([k, v]) => `${k}(${v}un)`).join(', ') : 'sem dados de tamanho'}

ESTOQUE ATUAL DA ${marca}:
- Valor: R$${stock.valor.toFixed(2)} | ${stock.pecas} peças | Cobertura: ${coberturaAtual.toFixed(1)} meses
- Tamanhos em estoque: ${Object.entries(stock.tamanhos).map(([k, v]) => `${k}(${v}un)`).join(', ') || 'sem dados'}
${margem !== null ? `- Margem estimada: ${margem}%` : ''}

DISTRIBUIÇÃO DE TAMANHOS DOS CLIENTES (${totalClientes} clientes cadastrados):
- Camiseta: ${formatTam(tamCamiseta)}
- Calça: ${formatTam(tamCalca)}
- Tênis: ${formatTam(tamTenis)}

CÁLCULO BASE:
- Necessidade ${periodo} meses: R$${(velocMensal * periodo).toFixed(2)}
- Estoque atual: R$${stock.valor.toFixed(2)}
- Gap sugerido: R$${necessario.toFixed(2)}

Responda APENAS JSON válido:
{
  "analise": "2-3 parágrafos diretos: velocidade real de venda, situação do estoque atual, recomendação final. Mencione se dados são limitados.",
  "velocidade_mensal_valor": ${velocMensal.toFixed(2)},
  "cobertura_atual_meses": ${coberturaAtual.toFixed(1)},
  "valor_comprar": number,
  "pecas_comprar": number,
  "distribuicao_tamanhos": [
    { "tamanho": "string", "pct": number, "qtd": number }
  ],
  "alerta_dados_insuficientes": ${dadosInsuficientes},
  "observacoes": ["string"]
}`
  } else {
    /* Modo meta */
    const marcasAlvo = marcas && marcas.length > 0 ? marcas : [...brandSales.keys()]
    const totalVendidoMarcas = marcasAlvo.reduce((s, m) => s + (brandSales.get(m)?.valor ?? 0), 0)

    const marcasInfo = marcasAlvo.map(m => {
      const s = brandSales.get(m) ?? { valor: 0, pecas: 0, tamanhos: {} }
      const st = brandStock.get(m) ?? { valor: 0, pecas: 0, custo: 0, tamanhos: {} }
      const velocMensal = mesesAnalisados > 0 ? s.valor / mesesAnalisados : 0
      const pctMix = totalVendidoMarcas > 0 ? (s.valor / totalVendidoMarcas) * 100 : 100 / marcasAlvo.length
      const cobertura = velocMensal > 0 ? st.valor / velocMensal : 0
      return { marca: m, valorTotal: s.valor, pecas: s.pecas, velocMensal, pctMix, stockValor: st.valor, cobertura }
    })

    prompt = `Você é especialista em gestão de compras para lojas de moda no Brasil. Seja direto e prático.

META: Faturar R$${meta_faturamento?.toFixed(2)} em ${periodo} meses
Marcas: ${marcasAlvo.join(', ')}
${dadosInsuficientes ? `⚠️ Apenas ${mesesAnalisados} ${mesesAnalisados === 1 ? 'mês' : 'meses'} de histórico — use como referência` : ''}

HISTÓRICO POR MARCA (últimos ${mesesAnalisados} meses):
${marcasInfo.map(m =>
  `- ${m.marca}: R$${m.valorTotal.toFixed(2)} vendidos | ${m.pecas} peças | R$${m.velocMensal.toFixed(2)}/mês | estoque atual R$${m.stockValor.toFixed(2)} (${m.cobertura.toFixed(1)}m cobertura) | mix ${m.pctMix.toFixed(0)}%`
).join('\n')}

DISTRIBUIÇÃO DE TAMANHOS DOS CLIENTES (${totalClientes} clientes):
- Camiseta: ${formatTam(tamCamiseta)}
- Calça: ${formatTam(tamCalca)}
- Tênis: ${formatTam(tamTenis)}

Responda APENAS JSON válido:
{
  "analise": "2-3 parágrafos: o que priorizar, mix ideal, como distribuir o investimento. Mencione limitações dos dados se houver.",
  "total_investir": number,
  "por_marca": [
    {
      "marca": "string",
      "pct_mix": number,
      "valor_comprar": number,
      "pecas_estimadas": number,
      "cobertura_atual_meses": number,
      "distribuicao_tamanhos": [
        { "tamanho": "string", "pct": number, "qtd": number }
      ]
    }
  ],
  "alerta_dados_insuficientes": ${dadosInsuficientes},
  "observacoes": ["string"]
}`
  }

  let responseText = ''
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
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

  try {
    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json({ ok: true, modo, result, mesesAnalisados, dadosInsuficientes })
  } catch {
    return NextResponse.json({ error: 'JSON inválido da IA' }, { status: 500 })
  }
}
