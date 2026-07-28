import { calcularPerfis, type PerfilCliente } from '@/lib/inteligencia/motor'
import { clienteServeProduto } from '@/lib/tamanhos'

/* ══════════════════════════════════════════════════════════════
   MOTOR DE OPORTUNIDADES — o cérebro (produto certo × pessoa certa)

   Fonte ÚNICA que casa produto×cliente em CÓDIGO (determinístico), com um
   score real: afinidade de marca × temperatura × tamanho serve × "só compra
   em desconto" (pra peça parada). Alimenta o plano diário e a Inteligência.
   A IA depois só escreve a mensagem — nunca escolhe o match (era o que fazia
   parecer "produto aleatório pra pessoa aleatória").
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
  tamanho: string           // o tamanho do cliente que casou
  diasParado: number
  tipo: 'fa_marca' | 'reativacao' | 'girar_desconto' | 'novidade' | 'match'
  score: number
  motivo: string            // curto, humano, pro dono entender NA HORA
  nota_dono: string | null  // observação do dono (verdade máxima), se houver
}

type Tam = { tamanho: string; qtd: number }
type EstoqueRow = {
  id: string; nome: string; marca: string | null; cor: string | null
  genero: string | null; tamanhos: Tam[] | null; preco_venda: number | null
  created_at: string | null; status: string | null
}
type ClienteRow = { id: string; nome: string; telefone: string | null; genero: string | null }

function generoOposto(produtoGen: string | null, clienteGen: string | null): boolean {
  const p = String(produtoGen ?? '').toUpperCase().charAt(0)
  const c = String(clienteGen ?? '').toUpperCase().charAt(0)
  if (p !== 'M' && p !== 'F') return false        // produto unissex/sem gênero → não filtra
  if (c !== 'M' && c !== 'F') return false        // cliente sem gênero → não exclui
  return p !== c
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gerarOportunidades(admin: any, userId: string, opts: { limite?: number; excluirContatadosDias?: number } = {}): Promise<Oportunidade[]> {
  const limite = opts.limite ?? 30
  const excluirDias = opts.excluirContatadosDias ?? 5

  const [{ data: vendas }, { data: clientes }, { data: estoque }, { data: acoes }] = await Promise.all([
    admin.from('vendas').select('id, cliente_id, cliente_nome, valor, data_venda, produtos, forma_pagamento, created_at')
      .eq('user_id', userId).order('data_venda', { ascending: true }).limit(4000),
    admin.from('clientes').select('id, nome, telefone, genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis, observacoes')
      .eq('user_id', userId).limit(3000),
    admin.from('estoque').select('id, nome, marca, cor, genero, tamanhos, preco_venda, created_at, status')
      .eq('user_id', userId).limit(5000),
    admin.from('inteligencia_acoes').select('cliente_id, enviada_em')
      .eq('user_id', userId).gte('enviada_em', new Date(Date.now() - excluirDias * 86400000).toISOString()),
  ])

  const perfis = calcularPerfis(vendas ?? [], clientes ?? [], estoque ?? [])
  const perfilPorId = new Map<string, PerfilCliente>(perfis.map(p => [p.clienteId, p]))

  const infoCliente = new Map<string, ClienteRow>()
  for (const c of (clientes ?? []) as ClienteRow[]) infoCliente.set(c.id, c)

  /* clientes contatados há pouco: não sugere de novo (cadência) */
  const contatadoRecente = new Set<string>()
  for (const a of (acoes ?? []) as { cliente_id: string | null }[]) if (a.cliente_id) contatadoRecente.add(a.cliente_id)

  const hoje = Date.now()
  const produtos = (estoque ?? []).filter((e: EstoqueRow) =>
    e.status !== 'vendido' && Array.isArray(e.tamanhos) && e.tamanhos.some(t => (Number(t.qtd) || 0) > 0)
  ) as EstoqueRow[]

  /* Melhor oportunidade por CLIENTE (não spamma o mesmo com vários produtos) */
  const melhorPorCliente = new Map<string, Oportunidade>()

  for (const prod of produtos) {
    const tamsProduto = (prod.tamanhos ?? []).filter(t => (Number(t.qtd) || 0) > 0).map(t => String(t.tamanho))
    if (!tamsProduto.length) continue
    const marcaLow = (prod.marca ?? '').toLowerCase().trim()
    const diasParado = prod.created_at ? Math.floor((hoje - new Date(prod.created_at).getTime()) / 86400000) : 0
    const novidade = diasParado <= 14
    const parado = diasParado >= 30

    for (const perfil of perfis) {
      const cli = infoCliente.get(perfil.clienteId)
      if (!cli || !cli.telefone) continue
      if (contatadoRecente.has(perfil.clienteId)) continue
      if (generoOposto(prod.genero, cli.genero)) continue

      /* tamanho tem que servir (senão não é "produto certo") */
      const tamsCliente = [cli['tamanho_camiseta' as keyof ClienteRow], cli['tamanho_calca' as keyof ClienteRow], cli['tamanho_tenis' as keyof ClienteRow]].filter(Boolean) as string[]
      if (!tamsCliente.length) continue
      if (!clienteServeProduto(tamsCliente, tamsProduto)) continue
      const tamCasou = tamsCliente.find(tc => clienteServeProduto([tc], tamsProduto)) ?? tamsProduto[0]

      /* ── SCORE ── */
      let score = 0
      let tipo: Oportunidade['tipo'] = 'match'
      const motivos: string[] = []

      /* afinidade de marca (via marcasTop/fidelidade do perfil ou observação) */
      const top = perfil.marcasTop?.[0]
      const obs = String(perfil.observacoes ?? '').toLowerCase()
      const faMarca = marcaLow && top && top.marca.toLowerCase() === marcaLow && top.pct >= 60 && top.n >= 3
      const gostaMarca = marcaLow && perfil.marcasTop?.some(m => m.marca.toLowerCase() === marcaLow)
      const obsMarca = marcaLow && obs.includes(marcaLow)
      if (faMarca) { score += 55; tipo = 'fa_marca'; motivos.push(`fã de ${prod.marca}`) }
      else if (gostaMarca) { score += 28; motivos.push(`curte ${prod.marca}`) }
      else if (obsMarca) { score += 24; motivos.push(`nota do dono cita ${prod.marca}`) }

      /* temperatura: sumido com histórico = ouro pra reativar */
      if (perfil.temperatura === 'frio' && perfil.qtdCompras >= 1 && perfil.diasSemComprar >= 20) {
        score += 32; if (tipo === 'match') tipo = 'reativacao'; motivos.push(`sumido há ${perfil.diasSemComprar}d`)
      } else if (perfil.temperatura === 'quente') { score += 12 }
      else if (perfil.temperatura === 'morno') { score += 16 }

      /* peça parada + cliente que só compra em desconto = casamento perfeito */
      if (parado && perfil.perfilPromo) { score += 26; tipo = 'girar_desconto'; motivos.push('só compra em promo → gira parado') }
      else if (parado) { score += 6 }

      /* novidade pra quem caça novidade */
      if (novidade && perfil.cacaNovidades) { score += 14; if (tipo === 'match') tipo = 'novidade'; motivos.push('gosta de novidade') }

      /* ticket alto compatível com o preço da peça (não oferecer caro pra quem gasta pouco) */
      if (perfil.ticketMedio && prod.preco_venda && prod.preco_venda <= perfil.ticketMedio * 1.6) score += 8

      if (score < 30) continue   // só oportunidade FORTE

      const motivo = `Veste ${tamCasou}${motivos.length ? ' · ' + motivos.slice(0, 2).join(' · ') : ''}`
      const op: Oportunidade = {
        clienteId: perfil.clienteId, clienteNome: perfil.nome, telefone: cli.telefone,
        produtoId: prod.id, produtoNome: prod.nome, marca: prod.marca, cor: prod.cor,
        preco: prod.preco_venda, tamanho: tamCasou, diasParado,
        tipo, score, motivo, nota_dono: perfil.observacoes || null,
      }
      const atual = melhorPorCliente.get(perfil.clienteId)
      if (!atual || op.score > atual.score) melhorPorCliente.set(perfil.clienteId, op)
    }
  }

  return [...melhorPorCliente.values()].sort((a, b) => b.score - a.score).slice(0, limite)
}
