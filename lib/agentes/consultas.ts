/* ══════════════════════════════════════════════════════════════
   FERRAMENTAS DE CONSULTA DO GERENTE (tool-use)

   O Gerente decide na hora qual buscar pra responder a pergunta do
   dono — vira um analista de verdade, sem a gente pré-adivinhar tudo.
   São SÓ leitura (nunca alteram nada). Cada uma devolve um objeto
   compacto que a IA transforma em resposta curta.
   ══════════════════════════════════════════════════════════════ */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const FERRAMENTAS_CONSULTA = [
  {
    name: 'consultar_vendas',
    description: 'Busca vendas da loja por período, cliente ou marca. Use pra responder qualquer pergunta sobre faturamento/vendas (quanto vendi, maior venda, vendas de um cliente/marca, etc).',
    input_schema: {
      type: 'object' as const,
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes', 'mes_passado', 'ano', 'tudo'], description: 'período; se não informar, usa "mes"' },
        data_inicio: { type: 'string', description: 'YYYY-MM-DD (opcional, sobrepõe o período)' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
        cliente: { type: 'string', description: 'nome parcial de um cliente pra filtrar' },
        marca: { type: 'string', description: 'marca pra filtrar as vendas' },
      },
    },
  },
  {
    name: 'consultar_clientes',
    description: 'Busca clientes por perfil: VIPs (maiores compradores), inativos (sem comprar há X dias), aniversariantes, por marca favorita, ou sem cadastro completo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filtro: { type: 'string', enum: ['vip', 'inativos', 'aniversario', 'por_marca', 'sem_cadastro', 'total'], description: 'obrigatório' },
        marca: { type: 'string', description: 'quando filtro = por_marca' },
        dias: { type: 'number', description: 'janela de dias (inativos: default 60; aniversario: default 7)' },
      },
      required: ['filtro'],
    },
  },
  {
    name: 'consultar_estoque',
    description: 'Busca produtos no estoque por marca, categoria, tamanho, ou os encalhados (parados há muito tempo).',
    input_schema: {
      type: 'object' as const,
      properties: {
        marca: { type: 'string' },
        categoria: { type: 'string' },
        tamanho: { type: 'string' },
        encalhado: { type: 'boolean', description: 'true = só os parados há mais de 60 dias' },
      },
    },
  },
]

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim()

/* Marca de um produto de venda: pelo estoque_id (mapa) ou pelo "(Marca)"
   no fim do nome. */
function marcaDoProduto(p: any, estoqueMarca: Map<string, string>): string | null {
  return (p.estoque_id && estoqueMarca.get(p.estoque_id)) ||
    (typeof p.nome === 'string' ? p.nome.match(/\(([^)]+)\)\s*$/)?.[1] ?? null : null)
}

async function consultarVendas(admin: any, userId: string, input: any) {
  const hoje = new Date()
  const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate()
  let inicio: Date | null = null, fim: Date | null = null

  if (input.data_inicio) inicio = new Date(input.data_inicio + 'T00:00:00')
  if (input.data_fim) fim = new Date(input.data_fim + 'T23:59:59')
  if (!inicio) {
    switch (input.periodo ?? 'mes') {
      case 'hoje': inicio = new Date(y, m, d); break
      case 'ontem': inicio = new Date(y, m, d - 1); fim = new Date(y, m, d - 1, 23, 59, 59); break
      case 'semana': inicio = new Date(y, m, d - 6); break
      case 'mes': inicio = new Date(y, m, 1); break
      case 'mes_passado': inicio = new Date(y, m - 1, 1); fim = new Date(y, m, 0, 23, 59, 59); break
      case 'ano': inicio = new Date(y, 0, 1); break
      case 'tudo': inicio = null; break
      default: inicio = new Date(y, m, 1)
    }
  }

  let q = admin.from('vendas').select('cliente_nome, valor, data_venda, created_at, produtos').eq('user_id', userId)
  if (inicio) q = q.gte('created_at', inicio.toISOString())
  if (fim) q = q.lte('created_at', fim.toISOString())
  const { data } = await q.order('valor', { ascending: false }).limit(2000)
  let vendas = (data ?? []) as any[]

  const { data: estq } = await admin.from('estoque').select('id, marca').eq('user_id', userId).limit(5000)
  const estoqueMarca = new Map<string, string>((estq ?? []).filter((e: any) => e.id && e.marca).map((e: any) => [e.id, e.marca]))

  if (input.cliente) vendas = vendas.filter(v => norm(v.cliente_nome).includes(norm(input.cliente)))
  if (input.marca) {
    vendas = vendas.filter(v => (Array.isArray(v.produtos) ? v.produtos : []).some((p: any) => norm(marcaDoProduto(p, estoqueMarca)) === norm(input.marca)))
  }

  const total = vendas.reduce((s, v) => s + (Number(v.valor) || 0), 0)
  return {
    periodo: input.periodo ?? (input.data_inicio ? `${input.data_inicio}..${input.data_fim ?? 'hoje'}` : 'mes'),
    total: Number(total.toFixed(2)),
    quantidade: vendas.length,
    ticket_medio: vendas.length ? Number((total / vendas.length).toFixed(2)) : 0,
    maiores_vendas: vendas.slice(0, 8).map(v => ({ cliente: v.cliente_nome || 'Avulso', valor: Number(v.valor) || 0, data: String(v.data_venda ?? v.created_at ?? '').slice(0, 10) })),
  }
}

async function consultarClientes(admin: any, userId: string, input: any) {
  const filtro = input.filtro
  const { data: clientes } = await admin
    .from('clientes').select('id, nome, telefone, data_nascimento, genero').eq('user_id', userId).limit(3000)
  const lista = (clientes ?? []) as any[]

  if (filtro === 'total') return { filtro, total: lista.length }

  if (filtro === 'sem_cadastro') {
    const semNasc = lista.filter(c => !c.data_nascimento)
    const semGen = lista.filter(c => !c.genero)
    return { filtro, sem_data_nascimento: semNasc.length, sem_genero: semGen.length, exemplos: semNasc.slice(0, 15).map(c => c.nome) }
  }

  if (filtro === 'aniversario') {
    const dias = input.dias ?? 7
    const hoje = new Date(); const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const res = lista.map(c => {
      if (!c.data_nascimento) return null
      const p = String(c.data_nascimento).slice(0, 10).split('-').map(Number)
      if (!p[1] || !p[2]) return null
      let alvo = new Date(base.getFullYear(), p[1] - 1, p[2])
      if (alvo < base) alvo = new Date(base.getFullYear() + 1, p[1] - 1, p[2])
      const dd = Math.round((alvo.getTime() - base.getTime()) / 86400000)
      return dd <= dias ? { nome: c.nome, data: `${String(p[2]).padStart(2, '0')}/${String(p[1]).padStart(2, '0')}`, em_dias: dd } : null
    }).filter(Boolean)
    return { filtro, janela_dias: dias, aniversariantes: res }
  }

  /* vip / inativos / por_marca precisam do histórico de vendas */
  const { data: vendas } = await admin
    .from('vendas').select('cliente_id, cliente_nome, valor, created_at, produtos').eq('user_id', userId).limit(5000)
  const vs = (vendas ?? []) as any[]

  if (filtro === 'vip') {
    const porCliente = new Map<string, { nome: string; total: number; qtd: number }>()
    for (const v of vs) {
      const nome = v.cliente_nome || 'Avulso'
      const cur = porCliente.get(nome) ?? { nome, total: 0, qtd: 0 }
      cur.total += Number(v.valor) || 0; cur.qtd++
      porCliente.set(nome, cur)
    }
    const top = [...porCliente.values()].sort((a, b) => b.total - a.total).slice(0, 10)
      .map(c => ({ cliente: c.nome, total: Number(c.total.toFixed(2)), compras: c.qtd }))
    return { filtro, top_clientes: top }
  }

  if (filtro === 'inativos') {
    const dias = input.dias ?? 60
    const limite = Date.now() - dias * 86400000
    const ultimaPorCliente = new Map<string, number>()
    for (const v of vs) {
      const nome = v.cliente_nome || null
      if (!nome) continue
      const t = new Date(v.created_at).getTime()
      ultimaPorCliente.set(nome, Math.max(ultimaPorCliente.get(nome) ?? 0, t))
    }
    const inativos = [...ultimaPorCliente.entries()]
      .filter(([, t]) => t < limite)
      .map(([nome, t]) => ({ cliente: nome, dias_sem_comprar: Math.floor((Date.now() - t) / 86400000) }))
      .sort((a, b) => a.dias_sem_comprar - b.dias_sem_comprar)
      .slice(0, 20)
    return { filtro, janela_dias: dias, inativos }
  }

  if (filtro === 'por_marca') {
    const { data: estq } = await admin.from('estoque').select('id, marca').eq('user_id', userId).limit(5000)
    const estoqueMarca = new Map<string, string>((estq ?? []).filter((e: any) => e.id && e.marca).map((e: any) => [e.id, e.marca]))
    const compradores = new Map<string, number>()
    for (const v of vs) {
      const nome = v.cliente_nome || null
      if (!nome) continue
      const comprou = (Array.isArray(v.produtos) ? v.produtos : []).some((p: any) => norm(marcaDoProduto(p, estoqueMarca)) === norm(input.marca))
      if (comprou) compradores.set(nome, (compradores.get(nome) ?? 0) + 1)
    }
    const res = [...compradores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([nome, n]) => ({ cliente: nome, compras_da_marca: n }))
    return { filtro, marca: input.marca, clientes: res }
  }

  return { filtro, erro: 'filtro não reconhecido' }
}

async function consultarEstoque(admin: any, userId: string, input: any) {
  let q = admin.from('estoque').select('nome, marca, categoria, cor, tamanhos, preco_venda, data_entrada, status').eq('user_id', userId)
  if (input.marca) q = q.ilike('marca', `%${input.marca}%`)
  if (input.categoria) q = q.ilike('categoria', `%${input.categoria}%`)
  const { data } = await q.limit(2000)
  let itens = (data ?? []) as any[]

  if (input.tamanho) {
    itens = itens.filter(i => (Array.isArray(i.tamanhos) ? i.tamanhos : []).some((t: any) => norm(t.tamanho) === norm(input.tamanho) && (Number(t.qtd) || 0) > 0))
  }
  if (input.encalhado) {
    const limite = Date.now() - 60 * 86400000
    itens = itens.filter(i => i.data_entrada && new Date(i.data_entrada).getTime() < limite)
  }
  /* só o que tem alguma peça */
  itens = itens.filter(i => (Array.isArray(i.tamanhos) ? i.tamanhos : []).some((t: any) => (Number(t.qtd) || 0) > 0))

  const totalPecas = itens.reduce((s, i) => s + (Array.isArray(i.tamanhos) ? i.tamanhos : []).reduce((a: number, t: any) => a + (Number(t.qtd) || 0), 0), 0)
  return {
    total_modelos: itens.length,
    total_pecas: totalPecas,
    itens: itens.slice(0, 25).map(i => ({
      nome: i.nome, marca: i.marca, cor: i.cor,
      tamanhos: (Array.isArray(i.tamanhos) ? i.tamanhos : []).filter((t: any) => (Number(t.qtd) || 0) > 0).map((t: any) => `${t.tamanho}(${t.qtd})`).join(' '),
      preco: i.preco_venda,
    })),
  }
}

/* Dispatcher chamado pelo loop de tool-use do Gerente */
export async function executarConsulta(admin: any, userId: string, nome: string, input: any): Promise<unknown> {
  try {
    if (nome === 'consultar_vendas') return await consultarVendas(admin, userId, input ?? {})
    if (nome === 'consultar_clientes') return await consultarClientes(admin, userId, input ?? {})
    if (nome === 'consultar_estoque') return await consultarEstoque(admin, userId, input ?? {})
    return { erro: `ferramenta desconhecida: ${nome}` }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha na consulta' }
  }
}
