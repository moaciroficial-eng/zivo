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

/* Normaliza marca da venda contra lista canônica do estoque.
   "Aramis Espírito Santo" → "Aramis" se "Aramis" estiver no estoque. */
function normalizarMarca(marcaVenda: string, canonicas: string[]): string {
  const lower = marcaVenda.toLowerCase().trim()
  // Correspondência exata
  const exata = canonicas.find(c => c.toLowerCase() === lower)
  if (exata) return exata
  // Venda começa com nome canônico seguido de espaço (ex: "Aramis ES" → "Aramis")
  const prefixo = canonicas.find(c => lower.startsWith(c.toLowerCase() + ' '))
  if (prefixo) return prefixo
  // Nome canônico está contido na marca da venda (ex: "Reserva Mini" → "Reserva")
  const contido = canonicas.find(c => lower.includes(c.toLowerCase()))
  if (contido) return contido
  return marcaVenda // sem match: mantém original
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

  /* ── Marcas canônicas (do estoque = nome limpo) ─────────── */
  const marcasCanónicas = [...new Set(
    (estoque ?? []).map(i => i.marca as string).filter(Boolean)
  )]

  /* ── Meses de dados disponíveis ─────────────────────────── */
  const vendaList = vendas ?? []
  const primeiraVenda = vendaList[0]?.data_venda
  const mesesDeDados  = primeiraVenda
    ? Math.max(1, Math.round((new Date(hojeStr).getTime() - new Date(primeiraVenda).getTime()) / (30 * 86400000)))
    : 0
  const mesesAnalisados    = Math.min(mesesDeDados, 6)
  const dadosInsuficientes = mesesAnalisados < 2

  /* ── Vendas por marca (com normalização) ────────────────── */
  const brandSales = new Map<string, BrandStat>()
  for (const venda of vendaList) {
    for (const prod of (venda.produtos as ProdutoVenda[]) ?? []) {
      if (!prod.marca) continue
      const marcaNorm = normalizarMarca(prod.marca, marcasCanónicas)
      const s = brandSales.get(marcaNorm) ?? { valor: 0, pecas: 0, tamanhos: {} }
      s.valor += prod.preco_venda ?? 0
      s.pecas++
      if (prod.tamanho) s.tamanhos[prod.tamanho] = (s.tamanhos[prod.tamanho] ?? 0) + 1
      brandSales.set(marcaNorm, s)
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

  /* ── Margem média das marcas (para cálculo de investimento) */
  let margemMediaPct = 55 // default conservador
  let totalVenda = 0, totalCusto = 0
  for (const s of brandStock.values()) {
    totalVenda += s.valor
    totalCusto += s.custo
  }
  if (totalCusto > 0 && totalVenda > 0) {
    margemMediaPct = Math.round(((totalVenda - totalCusto) / totalVenda) * 100)
  }
  const fatorCusto = 1 - margemMediaPct / 100 // ex: 0.45 se margem 55%

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
      if (cat.includes('camiseta'))    tamCamiseta[tam] = (tamCamiseta[tam] ?? 0) + 0.5
      else if (cat.includes('cal'))    tamCalca[tam]    = (tamCalca[tam]    ?? 0) + 0.5
      else if (cat.startsWith('t'))    tamTenis[tam]    = (tamTenis[tam]    ?? 0) + 0.5
    }
  }

  const totalClientes = Object.values(tamCamiseta).reduce((s, v) => s + Math.round(v), 0)

  /* ── Prompt por modo ────────────────────────────────────── */
  let prompt: string

  if (modo === 'pedido' && marca) {
    /* Busca com normalização: usuário digita "Aramis" → agrega todas as variantes */
    const marcaNorm = normalizarMarca(marca, marcasCanónicas)
    const sales = brandSales.get(marcaNorm) ?? { valor: 0, pecas: 0, tamanhos: {} }
    const stock = brandStock.get(marcaNorm) ?? { valor: 0, pecas: 0, custo: 0, tamanhos: {} }
    const velocMensal    = mesesAnalisados > 0 ? sales.valor / mesesAnalisados : 0
    const coberturaAtual = velocMensal > 0 ? stock.valor / velocMensal : 0
    const necessarioVenda = Math.max(0, velocMensal * periodo - stock.valor)
    const necessarioCusto = necessarioVenda * fatorCusto
    const margem          = stock.custo > 0 && stock.valor > 0
      ? Math.round(((stock.valor - stock.custo) / stock.valor) * 100)
      : margemMediaPct
    const tamVendas = Object.entries(sales.tamanhos).sort((a, b) => b[1] - a[1])

    prompt = `Você é especialista em gestão de compras para lojas de moda no Brasil. Seja direto e prático.

PEDIDO: Marca ${marcaNorm} | Período: ${periodo} meses
${dadosInsuficientes ? `⚠️ Apenas ${mesesAnalisados} ${mesesAnalisados === 1 ? 'mês' : 'meses'} de histórico — estimativas com precisão limitada` : ''}

HISTÓRICO DE VENDAS (últimos ${mesesAnalisados} meses):
- Total vendido (preço de venda): R$${sales.valor.toFixed(2)} | ${sales.pecas} peças
- Velocidade: R$${velocMensal.toFixed(2)}/mês em valor de venda | ${mesesAnalisados > 0 ? (sales.pecas / mesesAnalisados).toFixed(1) : 0} peças/mês
- Tamanhos vendidos: ${tamVendas.length > 0 ? tamVendas.map(([k, v]) => `${k}(${v}un)`).join(', ') : 'sem dados de tamanho nas vendas'}

ESTOQUE ATUAL DA ${marcaNorm}:
- Valor de venda em estoque: R$${stock.valor.toFixed(2)} | ${stock.pecas} peças
- Custo do estoque atual: R$${stock.custo.toFixed(2)}
- Cobertura estimada: ${coberturaAtual.toFixed(1)} meses
- Tamanhos no estoque: ${Object.entries(stock.tamanhos).map(([k, v]) => `${k}(${v}un)`).join(', ') || 'sem dados'}
- Margem estimada: ${margem}%

DISTRIBUIÇÃO DE TAMANHOS DOS CLIENTES (${totalClientes} clientes):
- Camiseta: ${formatTam(tamCamiseta)}
- Calça: ${formatTam(tamCalca)}
- Tênis: ${formatTam(tamTenis)}

COMO CALCULAR valor_comprar (IMPORTANTE):
- valor_comprar = quanto você vai PAGAR ao fornecedor (preço de custo, NÃO preço de venda)
- Necessidade em valor de venda para ${periodo} meses: R$${(velocMensal * periodo).toFixed(2)}
- Já tem em estoque (venda): R$${stock.valor.toFixed(2)}
- Gap em valor de venda: R$${necessarioVenda.toFixed(2)}
- Gap convertido para custo (margem ${margem}%): R$${necessarioCusto.toFixed(2)}
- Este é o ponto de partida — ajuste se necessário baseado no histórico e perfil da marca

Responda APENAS JSON válido:
{
  "analise": "2-3 parágrafos: velocidade real de venda, situação do estoque, recomendação clara de quanto comprar e por quê. Mencione que valor_comprar é o preço de custo.",
  "velocidade_mensal_valor": ${velocMensal.toFixed(2)},
  "cobertura_atual_meses": ${coberturaAtual.toFixed(1)},
  "valor_comprar": number (preço de custo a pagar ao fornecedor),
  "valor_comprar_venda": number (equivalente em valor de venda),
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
    const metaNum = meta_faturamento ?? 0
    /* Investimento total necessário (em custo) para atingir a meta */
    const investimentoBase = metaNum * fatorCusto

    const marcasInfo = marcasAlvo.map(m => {
      const s  = brandSales.get(m) ?? { valor: 0, pecas: 0, tamanhos: {} }
      const st = brandStock.get(m) ?? { valor: 0, pecas: 0, custo: 0, tamanhos: {} }
      const velocMensal    = mesesAnalisados > 0 ? s.valor / mesesAnalisados : 0
      const pctMix         = totalVendidoMarcas > 0 ? (s.valor / totalVendidoMarcas) * 100 : 100 / marcasAlvo.length
      const coberturaAtual = velocMensal > 0 ? st.valor / velocMensal : 0
      /* Quanto desta marca contribui para a meta */
      const metaMarca    = metaNum * (pctMix / 100)
      const estoqueCusto = st.custo > 0 ? st.custo : st.valor * fatorCusto
      const comprarCusto = Math.max(0, metaMarca * fatorCusto - estoqueCusto)
      return { marca: m, valorTotal: s.valor, pecas: s.pecas, velocMensal, pctMix, stockValor: st.valor, stockCusto: st.custo, coberturaAtual, metaMarca, comprarCusto }
    })

    prompt = `Você é especialista em gestão de compras para lojas de moda no Brasil. Seja direto e prático.

META: Faturar R$${metaNum.toFixed(2)} em ${periodo} meses
Marcas: ${marcasAlvo.join(', ')}
Margem média da loja: ${margemMediaPct}%
${dadosInsuficientes ? `⚠️ Apenas ${mesesAnalisados} ${mesesAnalisados === 1 ? 'mês' : 'meses'} de histórico — use como referência` : ''}

COMO CALCULAR total_investir e valor_comprar (REGRA FUNDAMENTAL):
- total_investir = quanto você vai PAGAR aos fornecedores (preço de custo), NÃO o valor de venda
- Fórmula: meta_faturamento × (1 - margem%) = investimento em custo
- Para R$${metaNum.toFixed(2)} com ${margemMediaPct}% de margem: investimento base = R$${investimentoBase.toFixed(2)}
- Desse valor, subtrai o estoque que já tem (em custo) de cada marca
- valor_comprar por marca = (meta da marca × fator_custo) - estoque_atual_em_custo

HISTÓRICO E ESTOQUE POR MARCA:
${marcasInfo.map(m =>
  `- ${m.marca}: vendeu R$${m.valorTotal.toFixed(2)} (${m.pctMix.toFixed(0)}% do mix) | velocidade R$${m.velocMensal.toFixed(2)}/mês | estoque venda R$${m.stockValor.toFixed(2)} custo R$${m.stockCusto.toFixed(2)} (${m.coberturaAtual.toFixed(1)}m cobertura) | meta desta marca: R$${m.metaMarca.toFixed(2)} | comprar (custo estimado): R$${m.comprarCusto.toFixed(2)}`
).join('\n')}

DISTRIBUIÇÃO DE TAMANHOS DOS CLIENTES (${totalClientes} clientes):
- Camiseta: ${formatTam(tamCamiseta)}
- Calça: ${formatTam(tamCalca)}
- Tênis: ${formatTam(tamTenis)}

Responda APENAS JSON válido:
{
  "analise": "2-3 parágrafos: investimento total necessário em custo, como distribuir entre as marcas, prioridades. Deixe claro que os valores são preço de compra (custo), não venda.",
  "total_investir": number (custo total a pagar — próximo de R$${investimentoBase.toFixed(2)}),
  "margem_media_pct": ${margemMediaPct},
  "por_marca": [
    {
      "marca": "string",
      "pct_mix": number,
      "valor_comprar": number (custo a pagar ao fornecedor),
      "valor_comprar_venda": number (equivalente em valor de venda),
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
