import { calcularPerfis, type PerfilCliente } from '@/lib/inteligencia/motor'
import { clienteServeProduto } from '@/lib/tamanhos'
import { proximasDatas } from '@/lib/datas-comemorativas'

/* ══════════════════════════════════════════════════════════════
   MOTOR DE OPORTUNIDADES — o cérebro (produto certo × pessoa certa)

   Fonte ÚNICA que casa produto×cliente em CÓDIGO (determinístico), com um
   score real: afinidade de marca × temperatura × tamanho serve × "só compra
   em desconto" (pra peça parada). Alimenta o plano diário e a Inteligência.
   A IA depois só escreve a mensagem — nunca escolhe o match.
   ══════════════════════════════════════════════════════════════ */

export type Oportunidade = {
  clienteId: string
  clienteNome: string
  telefone: string | null
  produtoId: string
  produtoNome: string
  marca: string | null
  cor: string | null
  preco: number | null
  tamanho: string
  diasParado: number
  tipo: 'fa_marca' | 'reativacao' | 'girar_desconto' | 'novidade' | 'match' | 'presente'
  score: number
  motivo: string
  nota_dono: string | null
  compraPara?: string | null
}

type Tam = { tamanho: string; qtd: number }
type EstoqueRow = {
  id: string; nome: string; marca: string | null; cor: string | null; categoria: string | null
  genero: string | null; tamanhos: Tam[] | null; preco_venda: number | null
  created_at: string | null; status: string | null
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'com', 'sem', 'pra', 'para', 'que', 'muito', 'essa', 'esse', 'peca', 'peça', 'roupa', 'cor', 'tipo', 'nada', 'mais', 'aqui', 'loja'])

/* A NOTA DO DONO manda: se ele anotou "não curte X / não usa Y", não oferece
   um produto que bata com X/Y (marca, cor, categoria ou palavra do nome). */
function produtoRejeitadoPorNota(observacoes: string | null, prod: EstoqueRow): boolean {
  const obs = String(observacoes ?? '').toLowerCase()
  if (!obs) return false
  const negRe = /(n[ãa]o\s+(?:curte|gosta(?:\s+de)?|usa|quer|veste|serve|combina)|odeia|detesta|evita|nunca\s+usa)\s+([a-zà-ú0-9/\s]{2,32})/gi
  const palavrasProduto = new Set(
    `${prod.marca ?? ''} ${prod.cor ?? ''} ${prod.categoria ?? ''} ${prod.nome ?? ''}`
      .toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-zà-ú0-9]+/).filter(w => w.length >= 3 && !STOP.has(w))
  )
  let m: RegExpExecArray | null
  while ((m = negRe.exec(obs)) !== null) {
    const termo = m[2].split(/[^a-zà-ú0-9]+/).filter(w => w.length >= 3 && !STOP.has(w))
    if (termo.some(w => palavrasProduto.has(w))) return true
  }
  return false
}
type DependenteRow = {
  id: string; relacao: string; genero?: string | null
  tamanho_camiseta?: string | null; tamanho_calca?: string | null; tamanho_tenis?: string | null
}
type ClienteRow = {
  id: string; nome: string; telefone: string | null; genero: string | null
  tamanho_camiseta: string | null; tamanho_calca: string | null; tamanho_tenis: string | null
  compra_para?: string | null; dependentes?: DependenteRow[] | null
}

/* Parte do corpo da peça → define QUAL tamanho do cliente usar.
   Camiseta casa com tamanho de camisa, calça com numeração de calça,
   calçado com número do pé. Sem isso, camiseta casava com 40/42 (calça). */
function parteDoCorpo(prod: EstoqueRow): 'camiseta' | 'calca' | 'tenis' | null {
  const t = `${prod.categoria ?? ''} ${prod.nome ?? ''}`.toLowerCase()
  if (/t[êe]nis|sapat|sand[áa]lia|chinelo|\bbota\b|botina|cal[çc]ado|mocassim|rasteir|papete|slide/.test(t)) return 'tenis'
  if (/camiseta|camisa|polo|blusa|regata|jaqueta|moletom|casaco|body|cropped|t-shirt|malha|su[ée]ter|colete|corta.?vento|top\b|cueca/.test(t)) return 'camiseta'
  if (/cal[çc]a|bermuda|short|jeans|legging|cal[çc][aã]o|jogger/.test(t)) return 'calca'
  return null
}

function generoOposto(produtoGen: string | null, clienteGen: string | null): boolean {
  const p = String(produtoGen ?? '').toUpperCase().charAt(0)
  const c = String(clienteGen ?? '').toUpperCase().charAt(0)
  if (p !== 'M' && p !== 'F') return false
  if (c !== 'M' && c !== 'F') return false
  return p !== c
}

/* Pontua UM par produto×cliente. Retorna a oportunidade ou null (não casa /
   fraca demais). scoreMin=0 pra visão do produto (mostra todos os que servem). */
function avaliarMatch(prod: EstoqueRow, perfil: PerfilCliente, cli: ClienteRow, scoreMin = 30): Oportunidade | null {
  if (!cli.telefone) return null
  // cliente que compra pra presente (não pra si) não entra no match comum --
  // tem lógica própria (gerarOportunidadesPresente), perto da data certa
  if (cli.compra_para && cli.compra_para !== 'si_mesmo') return null
  if (generoOposto(prod.genero, cli.genero)) return null
  if (produtoRejeitadoPorNota(perfil.observacoes, prod)) return null   // dono anotou que não curte

  const tamsProduto = (prod.tamanhos ?? []).filter(t => (Number(t.qtd) || 0) > 0).map(t => String(t.tamanho))
  if (!tamsProduto.length) return null

  /* Usa SÓ o tamanho da parte do corpo certa (camiseta≠calça≠pé). */
  const parte = parteDoCorpo(prod)
  const tamDaParte = parte === 'camiseta' ? cli.tamanho_camiseta
    : parte === 'calca' ? cli.tamanho_calca
      : parte === 'tenis' ? cli.tamanho_tenis
        : null
  const tamsCliente = (parte
    ? (tamDaParte ? [tamDaParte] : [])                                   // parte conhecida: só aquele campo
    : [cli.tamanho_camiseta, cli.tamanho_calca, cli.tamanho_tenis]) as (string | null)[]
  const tamsClienteOk = tamsCliente.filter(Boolean) as string[]
  if (!tamsClienteOk.length) return null
  if (!clienteServeProduto(tamsClienteOk, tamsProduto)) return null
  /* mostra o tamanho do PRODUTO que serve (ex: "no M"), não o número cru */
  const tamCasou = tamsProduto.find(tp => clienteServeProduto(tamsClienteOk, [tp])) ?? tamsProduto[0]

  const marcaLow = (prod.marca ?? '').toLowerCase().trim()
  const diasParado = prod.created_at ? Math.floor((Date.now() - new Date(prod.created_at).getTime()) / 86400000) : 0
  const novidade = diasParado <= 14
  const parado = diasParado >= 30

  let score = 0
  let tipo: Oportunidade['tipo'] = 'match'
  const motivos: string[] = []

  const top = perfil.marcasTop?.[0]
  const obs = String(perfil.observacoes ?? '').toLowerCase()
  const faMarca = marcaLow && top && top.marca.toLowerCase() === marcaLow && top.pct >= 60 && top.n >= 3
  const gostaMarca = marcaLow && perfil.marcasTop?.some(m => m.marca.toLowerCase() === marcaLow)
  const obsMarca = marcaLow && obs.includes(marcaLow)
  if (faMarca) { score += 55; motivos.push(`fã de ${prod.marca}`) }
  else if (gostaMarca) { score += 28; motivos.push(`curte ${prod.marca}`) }
  else if (obsMarca) { score += 24; motivos.push(`nota do dono cita ${prod.marca}`) }

  const reativacao = perfil.temperatura === 'frio' && perfil.qtdCompras >= 1 && perfil.diasSemComprar >= 20
  if (reativacao) { score += 32; motivos.push(`sumido há ${perfil.diasSemComprar}d`) }
  else if (perfil.temperatura === 'quente') { score += 12 }
  else if (perfil.temperatura === 'morno') { score += 16 }

  const girarDesconto = parado && perfil.perfilPromo
  if (girarDesconto) { score += 26; motivos.push('só compra em promo') }
  else if (parado) { score += 6 }

  const ehNovidade = novidade && perfil.cacaNovidades
  if (ehNovidade) { score += 14; motivos.push('gosta de novidade') }
  if (perfil.ticketMedio && prod.preco_venda && prod.preco_venda <= perfil.ticketMedio * 1.6) score += 8

  if (score < scoreMin) return null

  /* O tipo decide a MENSAGEM (reencontro, desconto...) por relevância da
     abordagem, não pela ordem em que o score foi somado: sumido há muito
     tempo pesa mais que ser fã de marca pra escolher a mensagem, senão o
     reencontro nunca aparece pra quem também tem marca favorita (caso real:
     cliente sumido há 108 dias e fã da marca recebia "chegou novidade da
     marca" em vez de reencontro). */
  if (reativacao) tipo = 'reativacao'
  else if (girarDesconto) tipo = 'girar_desconto'
  else if (faMarca) tipo = 'fa_marca'
  else if (ehNovidade) tipo = 'novidade'

  return {
    clienteId: perfil.clienteId, clienteNome: perfil.nome, telefone: cli.telefone,
    produtoId: prod.id, produtoNome: prod.nome, marca: prod.marca, cor: prod.cor,
    preco: prod.preco_venda, tamanho: tamCasou, diasParado,
    tipo, score, motivo: `Veste ${tamCasou}${motivos.length ? ' · ' + motivos.slice(0, 2).join(' · ') : ''}`,
    nota_dono: perfil.observacoes || null,
  }
}

/* Chave normalizada de produto pra detectar "é o mesmo item" (mesmo que tenha
   sido re-cadastrado com outro id): tira acento, códigos entre () e tamanho. */
function chaveProd(nome: string): string {
  return String(nome || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(pp|p|m|g|gg|xg|xgg|xggg|u|un|\d{1,3})\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
/* O cliente já tem este produto? (por id de estoque OU nome normalizado) */
function jaComprou(comprados: Set<string> | undefined, prod: EstoqueRow): boolean {
  if (!comprados) return false
  return comprados.has(`id:${prod.id}`) || (!!prod.nome && comprados.has(`n:${chaveProd(prod.nome)}`))
}

/* ── COMPRA PARA PRESENTE ──────────────────────────────────────
   Alguns clientes não compram pra si — compram sempre de presente (ex.:
   mulher que só leva peça masculina pro marido). Esses não entram no match
   comum (avaliarMatch já bloqueia); em vez disso, aparecem perto de uma data
   de presente, com mensagem própria (ver gerarOportunidadesPresente). */

/* Relação do dependente (cadastro hoje: marido/pai/filho/filha) → categoria
   de compra_para. O que não mapeia (ex. "pai") cai no genérico "presente". */
function relacaoParaCompraPara(relacao: string): string | null {
  if (relacao === 'marido') return 'marido'
  if (relacao === 'filho' || relacao === 'filha') return 'filhos'
  return null
}

/* Detecta compra_para pelo histórico de vendas marcadas como presente — só
   sugere quando o campo ainda está vazio (nunca sobrescreve escolha do dono)
   e exige pelo menos 2 vendas-presente, pra não decidir numa coincidência só. */
function detectarCompraPara(
  cliente: ClienteRow,
  vendasPresenteDoCliente: { para_dependente_id: string | null }[],
): string | null {
  if (cliente.compra_para) return null
  if (vendasPresenteDoCliente.length < 2) return null

  const depPorId = new Map((cliente.dependentes ?? []).map(d => [d.id, d.relacao]))
  const contagem = new Map<string, number>()
  for (const v of vendasPresenteDoCliente) {
    const relacao = v.para_dependente_id ? depPorId.get(v.para_dependente_id) : undefined
    const chave = (relacao && relacaoParaCompraPara(relacao)) || 'presente'
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  let melhor = 'presente', max = 0
  for (const [k, n] of contagem) if (n > max) { max = n; melhor = k }
  return melhor
}

/* Datas de presente relevantes por categoria — Natal e Black Friday valem
   pra todo mundo; namorado(a)/marido/esposa ganham o Dia dos Namorados;
   filhos ganham o Dia das Crianças. */
const DATAS_POR_COMPRA_PARA: Record<string, string[]> = {
  namorado: ['Dia dos Namorados', 'Natal', 'Black Friday'],
  namorada: ['Dia dos Namorados', 'Natal', 'Black Friday'],
  marido: ['Dia dos Namorados', 'Natal', 'Black Friday'],
  esposa: ['Dia dos Namorados', 'Natal', 'Black Friday'],
  filhos: ['Dia das Crianças', 'Natal', 'Black Friday'],
  presente: ['Natal', 'Black Friday'],
}

/* Gênero provável de quem vai receber o presente — vem da própria categoria
   (marido/namorado = recebe peça masculina), não do gênero do cliente. Pra
   "filhos" não filtra (criança pode ser qualquer um, não sabe qual filho). */
function generoPresenteadoDe(compraPara: string): 'M' | 'F' | null {
  if (compraPara === 'marido' || compraPara === 'namorado') return 'M'
  if (compraPara === 'esposa' || compraPara === 'namorada') return 'F'
  return null
}

/* ── APRENDIZADO: peso por tipo de oportunidade ──────────────────
   Cruza o log de oportunidades geradas com as vendas reais pra descobrir
   QUAL tipo converte mais NESTA loja, e devolve um multiplicador do score
   por tipo (suavização bayesiana, limitado a 0.6–1.6 pra não oscilar). */
const TIPOS_OP = ['fa_marca', 'reativacao', 'girar_desconto', 'novidade', 'match'] as const
function calcularPesosTipo(
  logs: { tipo: string | null; cliente_id: string | null; produto_id: string | null; marca: string | null; criado_em: string }[],
  comprasPorCli: Map<string, { produtos: { estoque_id?: string }[]; t: number }[]>,
  marcaPorId: Map<string, string>,
): Record<string, number> {
  const env: Record<string, number> = {}, conv: Record<string, number> = {}
  for (const t of TIPOS_OP) { env[t] = 0; conv[t] = 0 }
  const JAN = 14 * 86400000
  for (const l of logs) {
    const tipo = l.tipo ?? ''
    if (!(tipo in env) || !l.cliente_id) continue
    env[tipo]++
    const t0 = new Date(l.criado_em).getTime()
    const compras = comprasPorCli.get(l.cliente_id) ?? []
    const converteu = compras.some(c => {
      if (c.t <= t0 || c.t > t0 + JAN) return false
      return c.produtos.some(p =>
        (p.estoque_id && p.estoque_id === l.produto_id) ||
        (!!l.marca && !!p.estoque_id && marcaPorId.get(p.estoque_id) === l.marca))
    })
    if (converteu) conv[tipo]++
  }
  const totalEnv = Object.values(env).reduce((a, b) => a + b, 0)
  const totalConv = Object.values(conv).reduce((a, b) => a + b, 0)
  const pesos: Record<string, number> = {}
  if (totalEnv < 20 || totalConv === 0) return pesos  // dado insuficiente → não reponderao (tudo 1)
  const global = totalConv / totalEnv
  const K = 8
  for (const t of TIPOS_OP) {
    const rate = (conv[t] + K * global) / (env[t] + K)
    pesos[t] = Math.max(0.6, Math.min(1.6, rate / global))
  }
  return pesos
}

/* Carrega o contexto compartilhado (perfis + índices). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carregarContexto(admin: any, userId: string, excluirDias: number) {
  const [{ data: vendas }, { data: clientes }, { data: estoque }, { data: acoes }, { data: oplog }] = await Promise.all([
    admin.from('vendas').select('id, cliente_id, cliente_nome, valor, data_venda, produtos, forma_pagamento, created_at, presente, para_dependente_id')
      .eq('user_id', userId).order('data_venda', { ascending: true }).limit(4000),
    admin.from('clientes').select('id, nome, telefone, genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis, observacoes, compra_para, dependentes')
      .eq('user_id', userId).limit(3000),
    admin.from('estoque').select('id, nome, marca, cor, categoria, genero, tamanhos, preco_venda, created_at, status')
      .eq('user_id', userId).limit(5000),
    admin.from('inteligencia_acoes').select('cliente_id, enviada_em')
      .eq('user_id', userId).gte('enviada_em', new Date(Date.now() - excluirDias * 86400000).toISOString()),
    admin.from('oportunidades_log').select('tipo, cliente_id, produto_id, marca, criado_em')
      .eq('user_id', userId).gte('criado_em', new Date(Date.now() - 120 * 86400000).toISOString()),
  ])
  const perfis = calcularPerfis(vendas ?? [], clientes ?? [], estoque ?? [])
  const infoCliente = new Map<string, ClienteRow>()
  for (const c of (clientes ?? []) as ClienteRow[]) infoCliente.set(c.id, c)

  /* Detecta compra_para (uma vez só, igual ao nome_amigavel): só quando o
     campo ainda está vazio, persiste e já usa na mesma passada. */
  const vendasPresentePorCliente = new Map<string, { para_dependente_id: string | null }[]>()
  for (const v of (vendas ?? []) as { cliente_id: string | null; presente?: boolean | null; para_dependente_id?: string | null }[]) {
    if (!v.cliente_id || !v.presente) continue
    const lista = vendasPresentePorCliente.get(v.cliente_id) ?? []
    lista.push({ para_dependente_id: v.para_dependente_id ?? null })
    vendasPresentePorCliente.set(v.cliente_id, lista)
  }
  const atualizacoesCompraPara: { id: string; compra_para: string }[] = []
  for (const c of infoCliente.values()) {
    const detectado = detectarCompraPara(c, vendasPresentePorCliente.get(c.id) ?? [])
    if (detectado) { c.compra_para = detectado; atualizacoesCompraPara.push({ id: c.id, compra_para: detectado }) }
  }
  if (atualizacoesCompraPara.length) {
    // o builder do supabase-js só implementa .then (PromiseLike), não .catch --
    // chamar .catch direto nele dá TypeError em runtime (foi o bug que zerou
    // o Quem chamar hoje: a exceção estourava aqui e o fallback silencioso
    // de fora devolvia lista vazia pra todo mundo, sem erro visível)
    await Promise.all(atualizacoesCompraPara.map(async (u) => {
      try { await admin.from('clientes').update({ compra_para: u.compra_para }).eq('id', u.id) } catch { /* segue sem detectar esse cliente */ }
    }))
  }

  const contatadoRecente = new Set<string>()
  for (const a of (acoes ?? []) as { cliente_id: string | null }[]) if (a.cliente_id) contatadoRecente.add(a.cliente_id)

  /* Índice do que cada cliente JÁ comprou — pra não reofertar o mesmo item
     (ex: William já tem o chinelo, não adianta oferecer de novo). */
  const compradosPorCliente = new Map<string, Set<string>>()
  for (const v of (vendas ?? []) as { cliente_id: string | null; produtos: unknown }[]) {
    if (!v.cliente_id) continue
    let set = compradosPorCliente.get(v.cliente_id)
    if (!set) { set = new Set(); compradosPorCliente.set(v.cliente_id, set) }
    for (const p of (Array.isArray(v.produtos) ? v.produtos : []) as { estoque_id?: string; nome?: string }[]) {
      if (p.estoque_id) set.add(`id:${p.estoque_id}`)
      if (p.nome) set.add(`n:${chaveProd(p.nome)}`)
    }
  }

  /* Índices pro aprendizado: marca de cada produto e compras (com data) por cliente */
  const marcaPorId = new Map<string, string>()
  for (const e of (estoque ?? []) as EstoqueRow[]) if (e.marca) marcaPorId.set(e.id, e.marca)

  const comprasPorCli = new Map<string, { produtos: { estoque_id?: string }[]; t: number }[]>()
  for (const v of (vendas ?? []) as { cliente_id: string | null; produtos: unknown; data_venda: string | null; created_at: string | null }[]) {
    if (!v.cliente_id) continue
    const lista = comprasPorCli.get(v.cliente_id) ?? []
    lista.push({
      produtos: (Array.isArray(v.produtos) ? v.produtos : []) as { estoque_id?: string }[],
      t: new Date(v.created_at ?? v.data_venda ?? 0).getTime(),
    })
    comprasPorCli.set(v.cliente_id, lista)
  }

  const pesosTipo = calcularPesosTipo((oplog ?? []), comprasPorCli, marcaPorId)

  const produtos = (estoque ?? []).filter((e: EstoqueRow) =>
    e.status !== 'vendido' && Array.isArray(e.tamanhos) && e.tamanhos.some(t => (Number(t.qtd) || 0) > 0)
  ) as EstoqueRow[]
  return { perfis, infoCliente, contatadoRecente, produtos, compradosPorCliente, pesosTipo }
}

/* Máximo de clientes diferentes que podem receber a MESMA peça no mesmo dia
   — sem isso, a peça com maior score domina e "todo mundo recebe a mesma
   sugestão". Quando a peça já bateu o teto, o cliente usa seu 2º candidato
   (outra peça); se os dois já estiverem tomados, fica sem oferta hoje —
   melhor nenhuma sugestão do que repetir a mesma pra todo mundo. */
const MAX_CLIENTES_POR_PRODUTO = 3
const CANDIDATOS_POR_CLIENTE = 2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gerarOportunidades(admin: any, userId: string, opts: { limite?: number; excluirContatadosDias?: number } = {}): Promise<Oportunidade[]> {
  const limite = opts.limite ?? 30
  const { perfis, infoCliente, contatadoRecente, produtos, compradosPorCliente, pesosTipo } = await carregarContexto(admin, userId, opts.excluirContatadosDias ?? 5)

  /* 1) Até 2 melhores candidatos por cliente (não só o 1º) */
  const candidatosPorCliente = new Map<string, Oportunidade[]>()
  for (const prod of produtos) {
    for (const perfil of perfis) {
      if (contatadoRecente.has(perfil.clienteId)) continue
      if (jaComprou(compradosPorCliente.get(perfil.clienteId), prod)) continue  // já tem esse item
      const cli = infoCliente.get(perfil.clienteId)
      if (!cli) continue
      const op = avaliarMatch(prod, perfil, cli)
      if (!op) continue
      op.score = Math.round(op.score * (pesosTipo[op.tipo] ?? 1))   // aprendizado: reponderao por tipo

      const lista = candidatosPorCliente.get(perfil.clienteId) ?? []
      lista.push(op)
      lista.sort((a, b) => b.score - a.score)
      if (lista.length > CANDIDATOS_POR_CLIENTE) lista.length = CANDIDATOS_POR_CLIENTE
      candidatosPorCliente.set(perfil.clienteId, lista)
    }
  }

  /* 2) Distribui respeitando o teto por produto: percorre TODOS os candidatos
     (1ºs e 2ºs de todo mundo) em ordem de score — cada cliente fica com o
     melhor candidato ainda disponível (produto não lotado) na vez dele. */
  const todosCandidatos = [...candidatosPorCliente.values()].flat().sort((a, b) => b.score - a.score)
  const contagemPorProduto = new Map<string, number>()
  const escolhidoPorCliente = new Map<string, Oportunidade>()
  for (const op of todosCandidatos) {
    if (escolhidoPorCliente.has(op.clienteId)) continue          // cliente já ficou com um candidato melhor
    const n = contagemPorProduto.get(op.produtoId) ?? 0
    if (n >= MAX_CLIENTES_POR_PRODUTO) continue                   // peça já no teto — tenta o próximo candidato
    escolhidoPorCliente.set(op.clienteId, op)
    contagemPorProduto.set(op.produtoId, n + 1)
  }

  /* 3) Clientes que compram pra presente — não entraram no match comum
     (avaliarMatch já bloqueia), aparecem aqui só perto de uma data de
     presente relevante pra categoria deles. */
  const datasProximas = proximasDatas(20)
  const presenteCandidatos: Oportunidade[] = []
  if (datasProximas.length) {
    for (const perfil of perfis) {
      const cli = infoCliente.get(perfil.clienteId)
      if (!cli?.telefone || !cli.compra_para || cli.compra_para === 'si_mesmo') continue
      if (contatadoRecente.has(perfil.clienteId)) continue

      const datasRelevantes = DATAS_POR_COMPRA_PARA[cli.compra_para] ?? DATAS_POR_COMPRA_PARA.presente
      const dataAlvo = datasProximas.find(d => datasRelevantes.includes(d.nome))
      if (!dataAlvo) continue

      const generoPresenteado = generoPresenteadoDe(cli.compra_para)
      let melhor: Oportunidade | null = null
      for (const prod of produtos) {
        if (generoPresenteado && generoOposto(prod.genero, generoPresenteado)) continue
        if (jaComprou(compradosPorCliente.get(perfil.clienteId), prod)) continue
        const tamsProduto = (prod.tamanhos ?? []).filter(t => (Number(t.qtd) || 0) > 0)
        if (!tamsProduto.length) continue
        const score = prod.preco_venda && perfil.ticketMedio && prod.preco_venda <= perfil.ticketMedio * 1.6 ? 20 : 10
        if (melhor && score <= melhor.score) continue
        melhor = {
          clienteId: perfil.clienteId, clienteNome: perfil.nome, telefone: cli.telefone,
          produtoId: prod.id, produtoNome: prod.nome, marca: prod.marca, cor: prod.cor,
          preco: prod.preco_venda, tamanho: String(tamsProduto[0].tamanho), diasParado: 0,
          tipo: 'presente', score,
          motivo: `compra pra presente · ${dataAlvo.nome} em ${dataAlvo.dias} dia${dataAlvo.dias === 1 ? '' : 's'}`,
          nota_dono: perfil.observacoes || null,
          compraPara: cli.compra_para,
        }
      }
      if (melhor) presenteCandidatos.push(melhor)
    }
  }

  /* Reserva algumas vagas pra presente -- o score dele (10-20) é baixo pra
     poder comparar com o score do match comum (30-100+), então sem reserva
     ele quase nunca apareceria mesmo com a data batendo na porta. */
  const reservaPresente = Math.min(2, presenteCandidatos.length, limite)
  const presenteEscolhidos = presenteCandidatos.sort((a, b) => b.score - a.score).slice(0, reservaPresente)
  const normais = [...escolhidoPorCliente.values()].sort((a, b) => b.score - a.score).slice(0, limite - reservaPresente)
  return [...presenteEscolhidos, ...normais].sort((a, b) => b.score - a.score)
}

/* Todos os clientes que casam com UM produto (visão do produto, sem dedup).
   scoreMin menor (18) — mostra também matches medianos, o dono decide. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clientesParaProduto(admin: any, userId: string, produtoId: string): Promise<Oportunidade[]> {
  const { perfis, infoCliente, contatadoRecente, produtos, compradosPorCliente, pesosTipo } = await carregarContexto(admin, userId, 3)
  const prod = produtos.find(p => p.id === produtoId)
  if (!prod) return []
  const out: Oportunidade[] = []
  for (const perfil of perfis) {
    if (contatadoRecente.has(perfil.clienteId)) continue
    if (jaComprou(compradosPorCliente.get(perfil.clienteId), prod)) continue  // já tem esse item
    const cli = infoCliente.get(perfil.clienteId)
    if (!cli) continue
    const op = avaliarMatch(prod, perfil, cli, 18)
    if (op) { op.score = Math.round(op.score * (pesosTipo[op.tipo] ?? 1)); out.push(op) }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25)
}

/* Nome do produto limpo pra copy (tira códigos entre parênteses e tamanho no fim) */
/* Limpeza determinística (sem IA, sem custo) — tira o que claramente não
   deveria aparecer numa mensagem falada: códigos de referência (em
   qualquer posição, não só no fim), abreviações de composição ("C/ xxx")
   e o tamanho repetido no final. Deixa em minúsculo (a frase que usa isso
   já capitaliza o início sozinha). Não traduz cor nem resume a descrição —
   isso fica pro nome_amigavel (camada com IA, ver lib/inteligencia/nome-amigavel.ts). */
export function limparNomeProduto(nome: string, marca?: string | null): string {
  let n = String(nome || '')
    .normalize('NFC')
    .replace(/\([^)]*\)/g, ' ')              // códigos entre parênteses
    .replace(/\bC\/\s*\w+/gi, ' ')           // "C/ algodão" etc.
    .replace(/\b\d{2,}\b/g, ' ')             // números de referência (2+ dígitos), em qualquer posição
    .replace(/\b(PP|P|M|G|GG|XG|XGG|XGGG|U|UN)\b\s*$/i, '')  // tamanho em letra, só no final
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return n || (marca ? `peça ${marca}` : 'peça nova')
}
