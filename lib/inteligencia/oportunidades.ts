import { calcularPerfis, type PerfilCliente } from '@/lib/inteligencia/motor'
import { clienteServeProduto } from '@/lib/tamanhos'

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
  tipo: 'fa_marca' | 'reativacao' | 'girar_desconto' | 'novidade' | 'match'
  score: number
  motivo: string
  nota_dono: string | null
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
type ClienteRow = {
  id: string; nome: string; telefone: string | null; genero: string | null
  tamanho_camiseta: string | null; tamanho_calca: string | null; tamanho_tenis: string | null
}

/* Parte do corpo da peça → define QUAL tamanho do cliente usar.
   Camiseta casa com tamanho de camisa, calça com numeração de calça,
   calçado com número do pé. Sem isso, camiseta casava com 40/42 (calça). */
function parteDoCorpo(prod: EstoqueRow): 'camiseta' | 'calca' | 'tenis' | null {
  const t = `${prod.categoria ?? ''} ${prod.nome ?? ''}`.toLowerCase()
  if (/t[êe]nis|sapat|sand[áa]lia|chinelo|\bbota\b|botina|cal[çc]ado|mocassim|rasteir|papete|slide/.test(t)) return 'tenis'
  if (/camiseta|camisa|polo|blusa|regata|jaqueta|moletom|casaco|body|cropped|t-shirt|malha|su[ée]ter|colete|corta.?vento|top\b/.test(t)) return 'camiseta'
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
  if (faMarca) { score += 55; tipo = 'fa_marca'; motivos.push(`fã de ${prod.marca}`) }
  else if (gostaMarca) { score += 28; motivos.push(`curte ${prod.marca}`) }
  else if (obsMarca) { score += 24; motivos.push(`nota do dono cita ${prod.marca}`) }

  if (perfil.temperatura === 'frio' && perfil.qtdCompras >= 1 && perfil.diasSemComprar >= 20) {
    score += 32; if (tipo === 'match') tipo = 'reativacao'; motivos.push(`sumido há ${perfil.diasSemComprar}d`)
  } else if (perfil.temperatura === 'quente') { score += 12 }
  else if (perfil.temperatura === 'morno') { score += 16 }

  if (parado && perfil.perfilPromo) { score += 26; tipo = 'girar_desconto'; motivos.push('só compra em promo') }
  else if (parado) { score += 6 }

  if (novidade && perfil.cacaNovidades) { score += 14; if (tipo === 'match') tipo = 'novidade'; motivos.push('gosta de novidade') }
  if (perfil.ticketMedio && prod.preco_venda && prod.preco_venda <= perfil.ticketMedio * 1.6) score += 8

  if (score < scoreMin) return null

  return {
    clienteId: perfil.clienteId, clienteNome: perfil.nome, telefone: cli.telefone,
    produtoId: prod.id, produtoNome: prod.nome, marca: prod.marca, cor: prod.cor,
    preco: prod.preco_venda, tamanho: tamCasou, diasParado,
    tipo, score, motivo: `Veste ${tamCasou}${motivos.length ? ' · ' + motivos.slice(0, 2).join(' · ') : ''}`,
    nota_dono: perfil.observacoes || null,
  }
}

/* Carrega o contexto compartilhado (perfis + índices). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carregarContexto(admin: any, userId: string, excluirDias: number) {
  const [{ data: vendas }, { data: clientes }, { data: estoque }, { data: acoes }] = await Promise.all([
    admin.from('vendas').select('id, cliente_id, cliente_nome, valor, data_venda, produtos, forma_pagamento, created_at')
      .eq('user_id', userId).order('data_venda', { ascending: true }).limit(4000),
    admin.from('clientes').select('id, nome, telefone, genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis, observacoes')
      .eq('user_id', userId).limit(3000),
    admin.from('estoque').select('id, nome, marca, cor, categoria, genero, tamanhos, preco_venda, created_at, status')
      .eq('user_id', userId).limit(5000),
    admin.from('inteligencia_acoes').select('cliente_id, enviada_em')
      .eq('user_id', userId).gte('enviada_em', new Date(Date.now() - excluirDias * 86400000).toISOString()),
  ])
  const perfis = calcularPerfis(vendas ?? [], clientes ?? [], estoque ?? [])
  const infoCliente = new Map<string, ClienteRow>()
  for (const c of (clientes ?? []) as ClienteRow[]) infoCliente.set(c.id, c)
  const contatadoRecente = new Set<string>()
  for (const a of (acoes ?? []) as { cliente_id: string | null }[]) if (a.cliente_id) contatadoRecente.add(a.cliente_id)
  const produtos = (estoque ?? []).filter((e: EstoqueRow) =>
    e.status !== 'vendido' && Array.isArray(e.tamanhos) && e.tamanhos.some(t => (Number(t.qtd) || 0) > 0)
  ) as EstoqueRow[]
  return { perfis, infoCliente, contatadoRecente, produtos }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gerarOportunidades(admin: any, userId: string, opts: { limite?: number; excluirContatadosDias?: number } = {}): Promise<Oportunidade[]> {
  const limite = opts.limite ?? 30
  const { perfis, infoCliente, contatadoRecente, produtos } = await carregarContexto(admin, userId, opts.excluirContatadosDias ?? 5)

  const melhorPorCliente = new Map<string, Oportunidade>()
  for (const prod of produtos) {
    for (const perfil of perfis) {
      if (contatadoRecente.has(perfil.clienteId)) continue
      const cli = infoCliente.get(perfil.clienteId)
      if (!cli) continue
      const op = avaliarMatch(prod, perfil, cli)
      if (!op) continue
      const atual = melhorPorCliente.get(perfil.clienteId)
      if (!atual || op.score > atual.score) melhorPorCliente.set(perfil.clienteId, op)
    }
  }
  return [...melhorPorCliente.values()].sort((a, b) => b.score - a.score).slice(0, limite)
}

/* Todos os clientes que casam com UM produto (visão do produto, sem dedup).
   scoreMin menor (18) — mostra também matches medianos, o dono decide. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clientesParaProduto(admin: any, userId: string, produtoId: string): Promise<Oportunidade[]> {
  const { perfis, infoCliente, contatadoRecente, produtos } = await carregarContexto(admin, userId, 3)
  const prod = produtos.find(p => p.id === produtoId)
  if (!prod) return []
  const out: Oportunidade[] = []
  for (const perfil of perfis) {
    if (contatadoRecente.has(perfil.clienteId)) continue
    const cli = infoCliente.get(perfil.clienteId)
    if (!cli) continue
    const op = avaliarMatch(prod, perfil, cli, 18)
    if (op) out.push(op)
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25)
}

/* Nome do produto limpo pra copy (tira códigos entre parênteses e tamanho no fim) */
export function limparNomeProduto(nome: string, marca?: string | null): string {
  let n = String(nome || '').replace(/\([^)]*\)/g, ' ')
  n = n.replace(/\b(PP|P|M|G|GG|XG|XGG|XGGG|U|UN|\d{2})\b\s*$/i, '')
  n = n.replace(/\bC\/\s*\w+/gi, '').replace(/\s+/g, ' ').trim()
  return n || (marca ? `peça ${marca}` : 'peça nova')
}
