import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/* ══════════════════════════════════════════════════════════════
   INTELIGÊNCIA V3

   Camada 1 (este arquivo, determinística): cruza vendas, estoque,
   clientes e calendário e calcula COMPORTAMENTOS com evidência
   numérica — quem só compra em promoção, quem caça novidade,
   quem compra presente em mês fixo, quem depende de crediário...

   Camada 2 (LLM): recebe os comportamentos prontos e transforma
   em ações de venda específicas, que viram sugestões aprováveis
   na aba Ações (nada é enviado sem o dono aprovar).
   ══════════════════════════════════════════════════════════════ */

/* ── Tipos das linhas do banco ── */
type ProdutoVenda = {
  nome?: string; qtd?: number; tamanho?: string
  preco_unitario?: number; desconto?: number; preco_custo?: number
  estoque_id?: string; marca?: string
}
type VendaRow = {
  cliente_id: string | null; valor: number; data_venda: string
  forma_pagamento: string | null; presente: boolean | null
  produtos: ProdutoVenda[] | null; created_at: string
}
type ClienteRow = {
  id: string; nome: string; telefone: string | null; genero: string | null
  data_nascimento: string | null
  tamanho_camiseta: string | null; tamanho_calca: string | null; tamanho_tenis: string | null
}
type TamanhoItem = { tamanho: string; qtd: number }
type EstoqueRow = {
  id: string; nome: string; marca: string | null; categoria: string | null
  tamanhos: TamanhoItem[] | null; preco_venda: number | null
  data_entrada: string | null; genero: string | null
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function diasEntre(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

/* ── Perfil comportamental de um cliente ── */
export type PerfilCliente = {
  codigo: string
  clienteId: string
  nome: string
  qtdCompras: number
  totalGasto: number
  ticketMedio: number
  diasSemComprar: number
  ritmoMedioDias: number | null
  atrasado: boolean
  pctItensDesconto: number | null
  perfilPromo: boolean
  mediaDiasNovidade: number | null
  cacaNovidades: boolean
  tendenciaTicket: 'subindo' | 'caindo' | 'estavel' | null
  marcasTop: { marca: string; pct: number }[]
  categoriasTop: string[]
  tamanhos: string[]
  pagamentoDominante: string | null
  usaCrediario: boolean
  mesesPresente: number[]
  diaSemanaTop: string | null
  classificacao: string
  /* Temperatura: recência da compra em relação ao ritmo PRÓPRIO do cliente */
  temperatura: 'quente' | 'morno' | 'frio'
  /* Funil: profundidade do relacionamento (compras acumuladas) */
  funil: 'fundo' | 'meio' | 'topo'
}

export function calcularPerfis(
  vendas: VendaRow[],
  clientes: ClienteRow[],
  estoque: EstoqueRow[],
): PerfilCliente[] {
  const hoje = new Date()
  const estoquePorId = new Map(estoque.map(e => [e.id, e]))

  const vendasPorCliente = new Map<string, VendaRow[]>()
  for (const v of vendas) {
    if (!v.cliente_id) continue
    if (!vendasPorCliente.has(v.cliente_id)) vendasPorCliente.set(v.cliente_id, [])
    vendasPorCliente.get(v.cliente_id)!.push(v)
  }

  const perfis: PerfilCliente[] = []
  let idx = 0

  for (const cliente of clientes) {
    const vs = (vendasPorCliente.get(cliente.id) ?? [])
      .filter(v => v.data_venda)
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda))
    if (vs.length === 0) continue

    idx++
    const compras = vs.filter(v => !v.presente)
    const totalGasto = vs.reduce((s, v) => s + (Number(v.valor) || 0), 0)
    const ticketMedio = totalGasto / vs.length
    const ultima = vs[vs.length - 1].data_venda
    const diasSemComprar = Math.max(0, diasEntre(ultima, hoje))

    /* Ritmo de compra e atraso */
    let ritmoMedioDias: number | null = null
    if (compras.length >= 2) {
      const intervalos: number[] = []
      for (let i = 1; i < compras.length; i++) {
        intervalos.push(diasEntre(compras[i - 1].data_venda, compras[i].data_venda))
      }
      ritmoMedioDias = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
    }
    const atrasado = ritmoMedioDias != null && ritmoMedioDias >= 7 && diasSemComprar > ritmoMedioDias * 1.4

    /* Promoção: item com desconto explícito OU vendido abaixo do preço de tabela */
    let itensTotal = 0
    let itensDesconto = 0
    /* Novidade: dias entre a entrada do produto no estoque e a compra */
    const diasNovidade: number[] = []
    const marcaCount = new Map<string, number>()
    const categoriaCount = new Map<string, number>()
    const tamanhoCount = new Map<string, number>()

    for (const v of vs) {
      for (const p of (Array.isArray(v.produtos) ? v.produtos : [])) {
        itensTotal++
        const doEstoque = p.estoque_id ? estoquePorId.get(p.estoque_id) : undefined

        const temDescontoExplicito = (Number(p.desconto) || 0) > 0
        const precoTabela = doEstoque?.preco_venda ? Number(doEstoque.preco_venda) : null
        const abaixoTabela = precoTabela != null && p.preco_unitario != null
          && Number(p.preco_unitario) < precoTabela * 0.95
        if (temDescontoExplicito || abaixoTabela) itensDesconto++

        if (doEstoque?.data_entrada) {
          const d = diasEntre(doEstoque.data_entrada, v.data_venda)
          if (d >= 0 && d <= 365) diasNovidade.push(d)
        }

        const marca = p.marca ?? doEstoque?.marca ?? null
        if (marca) marcaCount.set(marca, (marcaCount.get(marca) ?? 0) + 1)
        const cat = doEstoque?.categoria
        if (cat && cat !== 'outros') categoriaCount.set(cat, (categoriaCount.get(cat) ?? 0) + 1)
        if (p.tamanho) tamanhoCount.set(String(p.tamanho), (tamanhoCount.get(String(p.tamanho)) ?? 0) + 1)
      }
    }

    const pctItensDesconto = itensTotal >= 2 ? Math.round((itensDesconto / itensTotal) * 100) : null
    const perfilPromo = pctItensDesconto != null && pctItensDesconto >= 60 && itensTotal >= 3

    const mediaDiasNovidade = diasNovidade.length >= 2
      ? Math.round(diasNovidade.reduce((s, v) => s + v, 0) / diasNovidade.length)
      : null
    const cacaNovidades = mediaDiasNovidade != null && mediaDiasNovidade <= 21

    /* Tendência do ticket: últimas 3 compras vs histórico */
    let tendenciaTicket: PerfilCliente['tendenciaTicket'] = null
    if (vs.length >= 4) {
      const ultimas3 = vs.slice(-3).reduce((s, v) => s + Number(v.valor || 0), 0) / 3
      if (ultimas3 > ticketMedio * 1.25) tendenciaTicket = 'subindo'
      else if (ultimas3 < ticketMedio * 0.75) tendenciaTicket = 'caindo'
      else tendenciaTicket = 'estavel'
    }

    const marcasTop = [...marcaCount.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([marca, n]) => ({ marca, pct: Math.round((n / Math.max(1, itensTotal)) * 100) }))
    const categoriasTop = [...categoriaCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0])
    const tamanhos = [...tamanhoCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0])
    /* Tamanhos do cadastro complementam os observados nas vendas */
    for (const t of [cliente.tamanho_camiseta, cliente.tamanho_calca, cliente.tamanho_tenis]) {
      if (t && !tamanhos.includes(t)) tamanhos.push(t)
    }

    /* Pagamento */
    const pagCount = new Map<string, number>()
    for (const v of vs) if (v.forma_pagamento) pagCount.set(v.forma_pagamento, (pagCount.get(v.forma_pagamento) ?? 0) + 1)
    const pagamentoDominante = [...pagCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const usaCrediario = (pagCount.get('crediario') ?? 0) > 0

    /* Presentes por mês (padrão anual) */
    const mesesPresente = [...new Set(
      vs.filter(v => v.presente).map(v => new Date(v.data_venda).getMonth() + 1)
    )].sort((a, b) => a - b)

    /* Dia da semana preferido */
    const diaCount = new Map<number, number>()
    for (const v of vs) {
      const d = new Date(`${v.data_venda}T12:00:00`).getDay()
      diaCount.set(d, (diaCount.get(d) ?? 0) + 1)
    }
    const diaTop = [...diaCount.entries()].sort((a, b) => b[1] - a[1])[0]
    const diaSemanaTop = diaTop && vs.length >= 3 && diaTop[1] / vs.length >= 0.5 ? DIAS_SEMANA[diaTop[0]] : null

    let classificacao = 'ativo'
    if (diasSemComprar > 90) classificacao = 'perdido'
    else if (diasSemComprar > 45) classificacao = 'em_risco'
    else if (vs.length >= 5 || totalGasto >= 1500) classificacao = 'vip'
    else if (vs.length >= 3) classificacao = 'fiel'

    /* Temperatura: mede a recência contra o ritmo PRÓPRIO do cliente —
       quem compra a cada 60d e está há 50d parado ainda é quente;
       quem compra semanalmente e sumiu há 30d já esfriou */
    const referencia = ritmoMedioDias && ritmoMedioDias >= 7 ? ritmoMedioDias : 30
    const temperatura: PerfilCliente['temperatura'] =
      diasSemComprar <= referencia * 1.2 ? 'quente'
      : diasSemComprar <= referencia * 2.5 ? 'morno'
      : 'frio'

    /* Funil: fundo = recorrente, meio = comprou 1-2x, topo = lead sem compra */
    const funil: PerfilCliente['funil'] = vs.length >= 3 ? 'fundo' : 'meio'

    perfis.push({
      codigo: `C${idx}`,
      clienteId: cliente.id,
      nome: cliente.nome,
      qtdCompras: vs.length,
      totalGasto: Math.round(totalGasto),
      ticketMedio: Math.round(ticketMedio),
      diasSemComprar,
      ritmoMedioDias,
      atrasado,
      pctItensDesconto,
      perfilPromo,
      mediaDiasNovidade,
      cacaNovidades,
      tendenciaTicket,
      marcasTop,
      categoriasTop,
      tamanhos,
      pagamentoDominante,
      usaCrediario,
      mesesPresente,
      diaSemanaTop,
      classificacao,
      temperatura,
      funil,
    })
  }

  return perfis
}

/* Fidelidade de marca: concentração das compras numa marca só */
export function fidelidadeMarca(p: PerfilCliente): { nivel: 'exclusiva' | 'forte' | 'variada' | 'sem_historico'; marca: string | null } {
  const top = p.marcasTop[0]
  if (!top || p.qtdCompras < 2) return { nivel: 'sem_historico', marca: top?.marca ?? null }
  if (top.pct >= 80 && p.qtdCompras >= 3) return { nivel: 'exclusiva', marca: top.marca }
  if (top.pct >= 60) return { nivel: 'forte', marca: top.marca }
  return { nivel: 'variada', marca: top.marca }
}

/* ── Vendabilidade: o que a loja vende FÁCIL e a que preço ── */
export type ProdutoStats = {
  chave: string          // "marca | categoria" ou nome
  unidades: number
  precoMedio: number
  pctComDesconto: number // % das unidades vendidas com desconto
  diasMedioParaVender: number | null
}

export function calcularVendabilidade(vendas: VendaRow[], estoque: EstoqueRow[]): ProdutoStats[] {
  const estoquePorId = new Map(estoque.map(e => [e.id, e]))
  const grupos = new Map<string, { unidades: number; somaPreco: number; comDesconto: number; diasVender: number[] }>()

  for (const v of vendas) {
    for (const p of (Array.isArray(v.produtos) ? v.produtos : [])) {
      const doEstoque = p.estoque_id ? estoquePorId.get(p.estoque_id) : undefined
      const marca = p.marca ?? doEstoque?.marca ?? '?'
      const cat = doEstoque?.categoria ?? 'outros'
      const chave = `${marca} | ${cat}`
      const qtd = Number(p.qtd) || 1

      if (!grupos.has(chave)) grupos.set(chave, { unidades: 0, somaPreco: 0, comDesconto: 0, diasVender: [] })
      const g = grupos.get(chave)!
      g.unidades += qtd
      g.somaPreco += (Number(p.preco_unitario) || 0) * qtd

      const precoTabela = doEstoque?.preco_venda ? Number(doEstoque.preco_venda) : null
      const teveDesconto = (Number(p.desconto) || 0) > 0 ||
        (precoTabela != null && p.preco_unitario != null && Number(p.preco_unitario) < precoTabela * 0.95)
      if (teveDesconto) g.comDesconto += qtd

      if (doEstoque?.data_entrada && v.data_venda) {
        const d = diasEntre(doEstoque.data_entrada, v.data_venda)
        if (d >= 0 && d <= 365) g.diasVender.push(d)
      }
    }
  }

  return [...grupos.entries()]
    .filter(([chave, g]) => g.unidades >= 2 && !chave.startsWith('?'))
    .map(([chave, g]) => ({
      chave,
      unidades: g.unidades,
      precoMedio: Math.round(g.somaPreco / Math.max(1, g.unidades)),
      pctComDesconto: Math.round((g.comDesconto / g.unidades) * 100),
      diasMedioParaVender: g.diasVender.length > 0
        ? Math.round(g.diasVender.reduce((s, v) => s + v, 0) / g.diasVender.length)
        : null,
    }))
    .sort((a, b) => b.unidades - a.unidades)
}

/* ── Linha compacta do perfil para o prompt ── */
function linhaPerfil(p: PerfilCliente): string {
  const flags: string[] = []
  const fid = fidelidadeMarca(p)
  if (fid.nivel === 'exclusiva') flags.push(`FIEL-À-MARCA(${fid.marca} ${p.marcasTop[0]?.pct}% — só oferecer essa marca)`)
  else if (fid.nivel === 'forte') flags.push(`PREFERE-MARCA(${fid.marca} ${p.marcasTop[0]?.pct}%)`)
  if (p.perfilPromo) flags.push(`SÓ-PROMOÇÃO(${p.pctItensDesconto}% dos itens com desconto)`)
  else if (p.pctItensDesconto != null && p.pctItensDesconto <= 15 && p.qtdCompras >= 3) flags.push('PAGA-PREÇO-CHEIO')
  if (p.cacaNovidades) flags.push(`CAÇA-NOVIDADES(compra em média ${p.mediaDiasNovidade}d após chegada)`)
  if (p.atrasado) flags.push(`ATRASADO(ritmo ${p.ritmoMedioDias}d, parado há ${p.diasSemComprar}d)`)
  if (p.tendenciaTicket === 'subindo') flags.push('TICKET-SUBINDO')
  if (p.tendenciaTicket === 'caindo') flags.push('TICKET-CAINDO')
  if (p.usaCrediario) flags.push('USA-CREDIÁRIO')
  if (p.mesesPresente.length > 0) flags.push(`PRESENTE-MÊS(${p.mesesPresente.join(',')})`)
  if (p.diaSemanaTop) flags.push(`COMPRA-${p.diaSemanaTop.toUpperCase()}`)

  const marcas = p.marcasTop.map(m => `${m.marca} ${m.pct}%`).join(', ')
  return `${p.codigo} ${p.nome} | ${p.temperatura.toUpperCase()}/${p.funil} | ${p.classificacao} | ${p.qtdCompras}x R$${p.totalGasto} (ticket R$${p.ticketMedio}) | ${p.diasSemComprar}d sem comprar${p.ritmoMedioDias ? ` (ritmo ${p.ritmoMedioDias}d)` : ''} | marcas: ${marcas || '—'} | cat: ${p.categoriasTop.join(',') || '—'} | tam: ${p.tamanhos.join(',') || '—'}${flags.length ? ` | ⚑ ${flags.join(' ')}` : ''}`
}

/* ══════════════════════════════════════════════════════════════
   MOTOR PRINCIPAL — usado pela rota manual e pelo cron diário
   ══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rodarInteligencia(admin: any, userId: string): Promise<{ ok: boolean; sugestoes?: number; clientes?: number; erro?: string }> {
  const agora = new Date()
  const hojeStr = agora.toISOString().split('T')[0]
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()

  const [{ data: vendas }, { data: estoque }, { data: clientes }, { data: contatos }, { data: eventos }, { data: config }, { data: meta }] = await Promise.all([
    admin.from('vendas')
      .select('cliente_id, valor, data_venda, forma_pagamento, presente, produtos, created_at')
      .eq('user_id', userId).order('data_venda', { ascending: true }).limit(3000),
    admin.from('estoque')
      .select('id, nome, marca, categoria, tamanhos, preco_venda, data_entrada, genero')
      .eq('user_id', userId).limit(5000),
    admin.from('clientes')
      .select('id, nome, telefone, genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .eq('user_id', userId).limit(1000),
    admin.from('whatsapp_contatos').select('id, cliente_id').eq('user_id', userId).limit(2000),
    admin.from('eventos').select('nome, data, descricao').eq('user_id', userId),
    admin.from('loja_config').select('nome_loja').eq('user_id', userId).maybeSingle(),
    admin.from('metas').select('meta_faturamento, meta_vendas')
      .eq('user_id', userId).eq('mes', agora.getMonth() + 1).eq('ano', agora.getFullYear()).maybeSingle(),
  ])

  /* ── Camada 1: comportamento calculado em código ── */
  const perfis = calcularPerfis(
    (vendas ?? []) as VendaRow[],
    (clientes ?? []) as ClienteRow[],
    (estoque ?? []) as EstoqueRow[],
  )
  if (perfis.length === 0) {
    return { ok: false, erro: 'Nenhum cliente com histórico de vendas vinculado.' }
  }

  const contatoPorCliente = new Map<string, string>(
    ((contatos ?? []) as { id: string; cliente_id: string | null }[])
      .filter(c => c.cliente_id).map(c => [c.cliente_id as string, c.id])
  )

  /* Persiste o perfil no contato_insights (alimenta os outros agentes) */
  for (const p of perfis) {
    const contatoId = contatoPorCliente.get(p.clienteId)
    if (!contatoId) continue
    const perfilCompra = p.perfilPromo ? 'promocao'
      : p.cacaNovidades ? 'novidades'
      : p.mesesPresente.length >= 2 ? 'presente'
      : 'regular'
    const fid = fidelidadeMarca(p)
    await admin.from('contato_insights').upsert({
      user_id: userId, contato_id: contatoId, cliente_id: p.clienteId,
      marca_principal: p.marcasTop[0]?.marca ?? null,
      marcas_favoritas: p.marcasTop.map(m => m.marca),
      fidelidade_marca: fid.nivel,
      tamanhos: p.tamanhos,
      classificacao: p.classificacao,
      temperatura: p.temperatura,
      total_gasto: p.totalGasto, qtd_compras: p.qtdCompras, ticket_medio: p.ticketMedio,
      dias_sem_comprar: p.diasSemComprar,
      perfil_compra: perfilCompra,
      raw: {
        pct_itens_desconto: p.pctItensDesconto,
        media_dias_novidade: p.mediaDiasNovidade,
        tendencia_ticket: p.tendenciaTicket,
        usa_crediario: p.usaCrediario,
        meses_presente: p.mesesPresente,
        dia_semana_top: p.diaSemanaTop,
        ritmo_medio_dias: p.ritmoMedioDias,
        atrasado: p.atrasado,
        funil: p.funil,
      },
      ultima_analise: agora.toISOString(), updated_at: agora.toISOString(),
    }, { onConflict: 'contato_id' })
  }

  /* ── Contexto da loja ── */
  const estoqueRows = (estoque ?? []) as EstoqueRow[]
  const comEstoque = (e: EstoqueRow) => (e.tamanhos ?? []).some(t => t.qtd > 0)

  const novidades = estoqueRows
    .filter(e => e.data_entrada && diasEntre(e.data_entrada, hojeStr) <= 21 && comEstoque(e))
    .slice(0, 25)
    .map(e => `${e.nome} (${e.marca ?? '?'}) tam ${(e.tamanhos ?? []).filter(t => t.qtd > 0).map(t => t.tamanho).join('/')} R$${Number(e.preco_venda ?? 0).toFixed(0)} — chegou há ${diasEntre(e.data_entrada!, hojeStr)}d`)

  const encalhados = estoqueRows
    .filter(e => e.data_entrada && diasEntre(e.data_entrada, hojeStr) >= 75 && comEstoque(e))
    .slice(0, 25)
    .map(e => `${e.nome} (${e.marca ?? '?'}) tam ${(e.tamanhos ?? []).filter(t => t.qtd > 0).map(t => t.tamanho).join('/')} R$${Number(e.preco_venda ?? 0).toFixed(0)} — parado há ${diasEntre(e.data_entrada!, hojeStr)}d`)

  const eventosProximos = ((eventos ?? []) as { nome: string; data: string; descricao: string | null }[])
    .filter(ev => {
      const d = diasEntre(hojeStr, ev.data)
      return d >= 0 && d <= 45
    })
    .map(ev => `${ev.nome} em ${ev.data}${ev.descricao ? ` (${ev.descricao})` : ''}`)

  const vendasRows = (vendas ?? []) as VendaRow[]
  const vendasDoMes = vendasRows.filter(v => v.created_at >= inicioMes)
  const faturamentoMes = vendasDoMes.reduce((s, v) => s + Number(v.valor || 0), 0)
  const vendasMes = vendasDoMes.length
  const nomeLoja = config?.nome_loja ?? 'a loja'

  /* ── Padrão real de venda da loja (pra meta realista) ── */
  const valores = vendasRows.map(v => Number(v.valor) || 0).filter(v => v > 0).sort((a, b) => a - b)
  const ticketMediano = valores.length > 0 ? Math.round(valores[Math.floor(valores.length / 2)]) : 0
  const diaDoMes = agora.getDate()
  const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()
  const diasRestantes = ultimoDia - diaDoMes
  const vendasPorDia = diaDoMes > 0 ? (vendasMes / diaDoMes) : 0

  let contextoMeta = 'META DO MÊS: não cadastrada'
  if (meta?.meta_faturamento) {
    const falta = Number(meta.meta_faturamento) - faturamentoMes
    contextoMeta = falta <= 0
      ? `META DO MÊS: R$${Number(meta.meta_faturamento).toFixed(0)} — JÁ BATIDA (vendido R$${faturamentoMes.toFixed(0)}). Foque em superar.`
      : `META DO MÊS: R$${Number(meta.meta_faturamento).toFixed(0)} | vendido R$${faturamentoMes.toFixed(0)} | FALTAM R$${falta.toFixed(0)} em ${diasRestantes} dia(s).
PADRÃO REAL DA LOJA: ticket mediano R$${ticketMediano}, ~${vendasPorDia.toFixed(1)} venda(s)/dia. Faltam ~${ticketMediano > 0 ? Math.ceil(falta / ticketMediano) : '?'} vendas no ticket típico.`
  }

  /* ── Vendabilidade: campeões e o que só sai com desconto ── */
  const stats = calcularVendabilidade(vendasRows, estoqueRows)
  const campeoes = stats
    .filter(s => s.pctComDesconto <= 40)
    .slice(0, 12)
    .map(s => `${s.chave}: ${s.unidades} vendidas, preço médio R$${s.precoMedio}, ${100 - s.pctComDesconto}% a preço cheio${s.diasMedioParaVender != null ? `, vende em ~${s.diasMedioParaVender}d` : ''}`)
  const soComDesconto = stats
    .filter(s => s.pctComDesconto >= 60)
    .slice(0, 8)
    .map(s => `${s.chave}: ${s.unidades} vendidas, ${s.pctComDesconto}% precisou de desconto`)

  /* Leads sem compra (topo de funil) */
  const clientesComCompra = new Set(perfis.map(p => p.clienteId))
  const leadsTopo = ((contatos ?? []) as { id: string; cliente_id: string | null }[])
    .filter(c => !c.cliente_id || !clientesComCompra.has(c.cliente_id)).length

  /* Aniversariantes dos próximos 30 dias */
  const aniversariantes = ((clientes ?? []) as ClienteRow[])
    .filter(c => c.data_nascimento)
    .map(c => {
      const [, m, d] = String(c.data_nascimento).split('-').map(Number)
      if (!m || !d) return null
      const aniv = new Date(agora.getFullYear(), m - 1, d)
      if (aniv < agora) aniv.setFullYear(agora.getFullYear() + 1)
      const dias = Math.round((aniv.getTime() - agora.getTime()) / 86400000)
      return dias <= 30 ? `${c.nome} (${d}/${m}, em ${dias}d)` : null
    })
    .filter(Boolean)
    .slice(0, 15)

  /* ── Camada 2: o modelo transforma comportamento em ação ── */
  const linhas = perfis
    .sort((a, b) => b.totalGasto - a.totalGasto)
    .slice(0, 150)
    .map(linhaPerfil)
    .join('\n')

  const prompt = `Você é o dono da ${nomeLoja} pensando sobre os próprios dados — analista sênior de varejo de moda. Sua função é encontrar dinheiro escondido e propor o caminho que o próprio dono tomaria.

Os COMPORTAMENTOS abaixo foram CALCULADOS a partir do histórico real de vendas (não são estimativas):
- QUENTE/MORNO/FRIO: temperatura em relação ao ritmo PRÓPRIO do cliente | fundo/meio = profundidade do funil
- FIEL-À-MARCA: 80%+ das compras numa marca só → ofereça SÓ essa marca pra ele
- PREFERE-MARCA: 60%+ numa marca → priorize essa marca
- SÓ-PROMOÇÃO: só compra com desconto → use pra girar encalhado; nunca oferta a preço cheio
- PAGA-PREÇO-CHEIO: nunca precisa de desconto → ofereça novidade/lançamento, NUNCA promoção (queima margem à toa)
- CAÇA-NOVIDADES: compra rápido o que chega → avise de novidades em primeira mão
- ATRASADO: passou do ritmo próprio de compra → reativação com contexto
- TICKET-CAINDO/SUBINDO: mudança recente | USA-CREDIÁRIO: sensível a parcelamento
- PRESENTE-MÊS(n): compra presente nesses meses → antecipe | COMPRA-DIA: dia da semana preferido

${contextoMeta}

CLIENTES (código | nome | temperatura/funil | classe | compras | recência | marcas | categorias | tamanhos | ⚑ comportamentos):
${linhas}

O QUE A LOJA VENDE FÁCIL (campeões — giram rápido e a preço cheio):
${campeoes.join('\n') || '(sem dados suficientes)'}

O QUE SÓ SAI COM DESCONTO (difícil vender a preço cheio):
${soComDesconto.join('\n') || '(nada relevante)'}

NOVIDADES NO ESTOQUE (últimos 21 dias):
${novidades.join('\n') || '(nenhuma)'}

ESTOQUE PARADO (75+ dias):
${encalhados.join('\n') || '(nenhum)'}

EVENTOS PRÓXIMOS (45 dias): ${eventosProximos.join(' | ') || '(nenhum)'}
ANIVERSARIANTES (30 dias): ${aniversariantes.join(' | ') || '(nenhum)'}
LEADS SEM COMPRA (topo de funil): ${leadsTopo} contato(s) no WhatsApp
MÊS ATUAL: ${agora.getMonth() + 1} | DATA: ${hojeStr}

Gere de 5 a 8 AÇÕES DE VENDA cruzando comportamento × estoque × meta × calendário. REGRAS:
1. PROIBIDO genérico ("faça uma promoção", "entre em contato"). Toda ação nomeia CLIENTES (pelo código) e PRODUTOS específicos.
2. Toda ação traz a EVIDÊNCIA numérica que a sustenta (os números estão acima).
3. META REALISTA: se falta bater a meta, monte o caminho com o PADRÃO da loja — várias vendas no ticket típico, de peças CAMPEÃS, para clientes QUENTES. NUNCA proponha uma única venda heroica de peça cara e difícil pra cliente frio (ex: faltam R$600 → 3 vendas de R$200 de peças que giram, não 1 peça de R$600 que só sai com desconto).
4. Priorize cruzamentos que o dono NÃO veria sozinho: promo-buyer × encalhado do tamanho dele; caça-novidades × peça que chegou essa semana; PRESENTE-MÊS(${agora.getMonth() + 1}) agora; paga-preço-cheio × novidade premium; crediário × peça cara parcelada; atrasado × marca favorita em estoque.
5. Respeite o perfil: fiel à marca recebe SÓ a marca dele; PAGA-PREÇO-CHEIO nunca recebe desconto; SÓ-PROMOÇÃO nunca recebe preço cheio; cliente FRIO não é alvo de meta urgente.
6. Para ação individual (1 cliente): "acao.tipo": "enviar_mensagem" com mensagem de WhatsApp pronta, natural, curta, assinada como ${nomeLoja}.
7. Para grupo (2+ clientes): "acao.tipo": "campanha" com a mensagem modelo.
8. Confira tamanho: só sugira peça se existe no tamanho do cliente.

Responda SOMENTE JSON:
{"sugestoes":[{"tipo":"meta|promo|novidade|reativacao|vip|cross_sell|presente|evento|oportunidade","titulo":"curto e específico","descricao":"a ação e o porquê","evidencia":"números que sustentam","prioridade":1,"acao":{"tipo":"enviar_mensagem|campanha|alerta","clientes":["C1"],"sugestao_mensagem":"..."}}]}`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, erro: 'IA não retornou JSON' }

  let sugestoes: {
    tipo: string; titulo: string; descricao: string; evidencia?: string; prioridade?: number
    acao?: { tipo?: string; clientes?: string[]; sugestao_mensagem?: string } | null
  }[] = []
  try { sugestoes = JSON.parse(jsonMatch[0]).sugestoes ?? [] } catch { return { ok: false, erro: 'JSON inválido da IA' } }

  /* Resolve códigos C1..Cn de volta para clientes reais */
  const porCodigo = new Map(perfis.map(p => [p.codigo, p]))

  const rows = sugestoes.map(s => {
    const codigos = s.acao?.clientes ?? []
    const alvo = codigos.map(c => porCodigo.get(c)).filter(Boolean) as PerfilCliente[]
    const nomes = alvo.map(p => p.nome)

    let acao: Record<string, unknown> | null = null
    if (s.acao?.tipo === 'enviar_mensagem' && alvo.length === 1 && s.acao.sugestao_mensagem) {
      const contatoId = contatoPorCliente.get(alvo[0].clienteId)
      acao = contatoId
        ? { tipo: 'enviar_mensagem', cliente_id: alvo[0].clienteId, contato_id: contatoId, clientes: nomes, sugestao_mensagem: s.acao.sugestao_mensagem }
        : { tipo: 'campanha', clientes: nomes, sugestao_mensagem: s.acao.sugestao_mensagem }
    } else if (s.acao) {
      acao = { tipo: s.acao.tipo ?? 'alerta', clientes: nomes, sugestao_mensagem: s.acao.sugestao_mensagem ?? null }
    }

    const descricao = s.evidencia ? `${s.descricao}\n\n📊 ${s.evidencia}` : s.descricao
    return {
      user_id: userId, tipo: s.tipo || 'oportunidade', titulo: s.titulo, descricao,
      prioridade: s.prioridade ?? 2, acao, status: 'pendente',
    }
  }).filter(r => r.titulo && r.descricao)

  /* Limpa análise anterior, preservando sugestões de envio pendentes do cron v2 */
  await admin.from('agente_sugestoes').delete()
    .eq('user_id', userId).eq('status', 'pendente')
    .or('acao.is.null,acao->>tipo.neq.enviar_mensagem')

  if (rows.length > 0) await admin.from('agente_sugestoes').insert(rows)

  return { ok: true, sugestoes: rows.length, clientes: perfis.length }
}
