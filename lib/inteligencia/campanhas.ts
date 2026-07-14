import Anthropic from '@anthropic-ai/sdk'
import { calcularPerfis } from '@/lib/inteligencia/motor'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/* ══════════════════════════════════════════════════════════════
   ESPECIALISTA EM MARKETING & VENDAS — gera campanhas por ocasião

   Cruza calendário × comportamento × estoque e produz uma campanha
   pronta: público-alvo (critério que o CÓDIGO resolve, sem o modelo
   enumerar IDs), mensagem persuasiva e produtos em destaque.
   ══════════════════════════════════════════════════════════════ */

type CriterioPublico =
  | 'compraram_presente_ocasiao'  // compraram presente nessa data ano passado
  | 'ativos'                      // compraram nos últimos 90 dias
  | 'homens' | 'mulheres'
  | 'todos'

export type PropostaCampanha = {
  ok: boolean
  erro?: string
  titulo: string
  objetivo: string
  publico_descricao: string
  publico_criterio: CriterioPublico
  mensagem: string          // usa {nome} pro primeiro nome
  produtos_destaque: string[]
  dica: string
}

/* Datas comemorativas com público padrão sugerido */
const OCASIOES: Record<string, { nome: string; janela: [number, number][] }> = {
  dia_dos_pais:      { nome: 'Dia dos Pais',      janela: [[8, 1], [8, 14]] },
  dia_das_maes:      { nome: 'Dia das Mães',      janela: [[5, 1], [5, 14]] },
  dia_dos_namorados: { nome: 'Dia dos Namorados', janela: [[6, 1], [6, 12]] },
  dia_das_criancas:  { nome: 'Dia das Crianças',  janela: [[10, 1], [10, 12]] },
  black_friday:      { nome: 'Black Friday',      janela: [[11, 20], [11, 30]] },
  natal:             { nome: 'Natal',             janela: [[12, 10], [12, 24]] },
}

function diasEntre(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gerarCampanhaOcasiao(admin: any, userId: string, ocasiaoKey: string): Promise<PropostaCampanha> {
  const oc = OCASIOES[ocasiaoKey]
  const vazio = { ok: false, titulo: '', objetivo: '', publico_descricao: '', publico_criterio: 'ativos' as CriterioPublico, mensagem: '', produtos_destaque: [], dica: '' }
  if (!oc) return { ...vazio, erro: 'Ocasião não reconhecida' }

  const agora = new Date()

  const [{ data: vendas }, { data: estoque }, { data: clientes }, { data: config }] = await Promise.all([
    admin.from('vendas').select('cliente_id, valor, data_venda, forma_pagamento, presente, produtos, created_at')
      .eq('user_id', userId).order('data_venda', { ascending: true }).limit(3000),
    admin.from('estoque').select('id, nome, marca, categoria, tamanhos, preco_venda, genero, data_entrada')
      .eq('user_id', userId).limit(5000),
    admin.from('clientes').select('id, nome, telefone, genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .eq('user_id', userId).limit(1000),
    admin.from('loja_config').select('nome_loja').eq('user_id', userId).maybeSingle(),
  ])

  const perfis = calcularPerfis(vendas ?? [], clientes ?? [], estoque ?? [])
  const nomeLoja = config?.nome_loja ?? 'a loja'

  /* Quando é a próxima ocorrência da data */
  let inicio = new Date(agora.getFullYear(), oc.janela[0][0] - 1, oc.janela[0][1])
  const fim = new Date(agora.getFullYear(), oc.janela[1][0] - 1, oc.janela[1][1])
  if (fim < agora) inicio = new Date(agora.getFullYear() + 1, oc.janela[0][0] - 1, oc.janela[0][1])
  const diasAte = Math.max(0, diasEntre(agora, inicio))
  const anoJanela = inicio.getFullYear() - 1
  const ini = `${anoJanela}-${String(oc.janela[0][0]).padStart(2, '0')}-${String(oc.janela[0][1]).padStart(2, '0')}`
  const fimStr = `${anoJanela}-${String(oc.janela[1][0]).padStart(2, '0')}-${String(oc.janela[1][1]).padStart(2, '0')}`

  /* Quem comprou nessa janela ano passado (presente ou não) */
  const datasPorCliente = new Map<string, string[]>()
  for (const v of (vendas ?? []) as { cliente_id: string | null; data_venda: string }[]) {
    if (!v.cliente_id || !v.data_venda) continue
    if (!datasPorCliente.has(v.cliente_id)) datasPorCliente.set(v.cliente_id, [])
    datasPorCliente.get(v.cliente_id)!.push(v.data_venda)
  }
  const compraramAnoPassado = perfis.filter(p =>
    (datasPorCliente.get(p.clienteId) ?? []).some(d => d >= ini && d <= fimStr)
  )

  /* Estoque relevante: pra Dia dos Pais, pri오riza masculino */
  type Tam = { tamanho: string; qtd: number }
  const foco = ocasiaoKey === 'dia_dos_pais' ? 'M'
    : ocasiaoKey === 'dia_das_maes' ? 'F'
    : null
  const emEstoque = (estoque ?? []).filter((e: { tamanhos: Tam[] | null; genero: string | null }) =>
    (e.tamanhos ?? []).some(t => t.qtd > 0) && (!foco || !e.genero || e.genero === foco || e.genero === 'U')
  )
  const produtosStr = emEstoque.slice(0, 40).map((e: { nome: string; marca: string | null; preco_venda: number | null }) =>
    `${e.nome}${e.marca ? ` (${e.marca})` : ''} R$${Number(e.preco_venda ?? 0).toFixed(0)}`
  ).join('\n')

  const clientesStr = perfis.slice(0, 80).map(p => {
    const comprou = (datasPorCliente.get(p.clienteId) ?? []).some(d => d >= ini && d <= fimStr)
    return `${p.nome} | ${p.temperatura} | ${p.qtdCompras}x | marcas: ${p.marcasTop.map(m => m.marca).join(',') || '—'}${comprou ? ' | COMPROU-NESSA-DATA-ANO-PASSADO' : ''}`
  }).join('\n')

  const prompt = `Você é especialista sênior em marketing e vendas de varejo de moda, trabalhando para ${nomeLoja}.
Crie uma campanha de WhatsApp para ${oc.nome}, que acontece em ${diasAte} dias.

CONTEXTO DA LOJA:
- ${compraramAnoPassado.length} cliente(s) compraram nessa mesma data no ano passado
- ${perfis.length} clientes com histórico

CLIENTES (nome | temperatura | compras | marcas | comprou nessa data ano passado?):
${clientesStr || '(poucos dados)'}

ESTOQUE DISPONÍVEL${foco === 'M' ? ' (foco masculino p/ presente de pai)' : foco === 'F' ? ' (foco feminino)' : ''}:
${produtosStr || '(sem estoque relevante)'}

Monte a campanha. REGRAS:
1. A mensagem de WhatsApp deve ser curta, calorosa, brasileira, com 1 gancho de urgência (a data chegando) e 1 chamada pra ação ("passa aqui", "posso te mostrar"). Use {nome} para o primeiro nome do cliente. Assine como ${nomeLoja}.
2. Escolha o público pelo CRITÉRIO que faz mais sentido (não liste nomes):
   - "compraram_presente_ocasiao": quem já comprou nessa data antes (maior taxa de conversão)
   - "ativos": quem comprou nos últimos 90 dias
   - "homens" ou "mulheres": por gênero
   - "todos": toda a base com WhatsApp
3. Sugira 3-5 produtos em destaque do estoque acima (presentes ideais pra ocasião).
4. Dê 1 dica de timing/execução.

Responda SOMENTE JSON:
{"titulo":"nome da campanha","objetivo":"o que ela busca","publico_descricao":"quem vai receber e por quê","publico_criterio":"compraram_presente_ocasiao|ativos|homens|mulheres|todos","mensagem":"texto com {nome}","produtos_destaque":["..."],"dica":"..."}`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { ...vazio, erro: 'IA não retornou JSON' }
  try {
    const p = JSON.parse(m[0])
    return {
      ok: true,
      titulo: p.titulo ?? `Campanha ${oc.nome}`,
      objetivo: p.objetivo ?? '',
      publico_descricao: p.publico_descricao ?? '',
      publico_criterio: p.publico_criterio ?? 'ativos',
      mensagem: p.mensagem ?? '',
      produtos_destaque: Array.isArray(p.produtos_destaque) ? p.produtos_destaque : [],
      dica: p.dica ?? '',
    }
  } catch {
    return { ...vazio, erro: 'JSON inválido' }
  }
}

/* Resolve a lista de clientes-alvo pelo critério (código, não modelo) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolverPublico(admin: any, userId: string, ocasiaoKey: string, criterio: CriterioPublico): Promise<{ id: string; nome: string; telefone: string | null }[]> {
  const oc = OCASIOES[ocasiaoKey]
  const agora = new Date()

  const { data: clientes } = await admin
    .from('clientes').select('id, nome, telefone, genero').eq('user_id', userId).limit(2000)
  const lista = (clientes ?? []) as { id: string; nome: string; telefone: string | null; genero: string | null }[]
  const comTel = lista.filter(c => c.telefone && String(c.telefone).trim())

  if (criterio === 'homens') return comTel.filter(c => (c.genero ?? '').toUpperCase().startsWith('M'))
  if (criterio === 'mulheres') return comTel.filter(c => (c.genero ?? '').toUpperCase().startsWith('F'))

  if (criterio === 'ativos') {
    const desde = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const { data: vendas } = await admin.from('vendas').select('cliente_id').eq('user_id', userId).gte('data_venda', desde)
    const ativos = new Set((vendas ?? []).map((v: { cliente_id: string | null }) => v.cliente_id).filter(Boolean))
    return comTel.filter(c => ativos.has(c.id))
  }

  if (criterio === 'compraram_presente_ocasiao' && oc) {
    let inicio = new Date(agora.getFullYear(), oc.janela[0][0] - 1, oc.janela[0][1])
    const fim = new Date(agora.getFullYear(), oc.janela[1][0] - 1, oc.janela[1][1])
    if (fim < agora) inicio = new Date(agora.getFullYear() + 1, oc.janela[0][0] - 1, oc.janela[0][1])
    const anoJanela = inicio.getFullYear() - 1
    const ini = `${anoJanela}-${String(oc.janela[0][0]).padStart(2, '0')}-${String(oc.janela[0][1]).padStart(2, '0')}`
    const fimStr = `${anoJanela}-${String(oc.janela[1][0]).padStart(2, '0')}-${String(oc.janela[1][1]).padStart(2, '0')}`
    const { data: vendas } = await admin.from('vendas').select('cliente_id, data_venda').eq('user_id', userId).gte('data_venda', ini).lte('data_venda', fimStr)
    const ids = new Set((vendas ?? []).map((v: { cliente_id: string | null }) => v.cliente_id).filter(Boolean))
    return comTel.filter(c => ids.has(c.id))
  }

  return comTel // 'todos'
}
