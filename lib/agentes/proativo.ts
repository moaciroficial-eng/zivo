import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type TamanhoItem = { tamanho: string; qtd: number }

/* ─── 1. OPORTUNIDADES POR MARCA ─────────────────────────────────────── */
async function oportunidadesMarca(admin: SupabaseClient, userId: string): Promise<string[]> {
  const alertas: string[] = []

  const { data: insights } = await admin
    .from('contato_insights')
    .select('contato_id, marca_principal, fidelidade_marca, marcas_favoritas, tamanhos')
    .eq('user_id', userId)
    .not('marca_principal', 'is', null)
    .neq('fidelidade_marca', 'sem_historico')

  if (!insights?.length) return alertas

  const { data: estoque } = await admin
    .from('estoque')
    .select('nome, marca, cor, tamanhos, preco_venda')
    .eq('user_id', userId)
    .eq('status', 'disponivel')

  const { data: contatos } = await admin
    .from('whatsapp_contatos')
    .select('id, nome')
    .eq('user_id', userId)
    .in('id', insights.map(i => i.contato_id))

  const nomeMap = new Map((contatos ?? []).map(c => [c.id, c.nome]))

  for (const insight of insights) {
    const marca = insight.marca_principal as string
    const nivel = insight.fidelidade_marca as string
    const nome  = nomeMap.get(insight.contato_id) ?? 'Cliente'
    const tamanhos = (insight.tamanhos as string[] ?? [])

    const produtosDaMarca = (estoque ?? []).filter(e =>
      e.marca?.toLowerCase().includes(marca.toLowerCase()) &&
      (e.tamanhos as TamanhoItem[]).some(t => t.qtd > 0)
    )

    if (!produtosDaMarca.length) continue

    /* Filtra pelo tamanho preferido se soubermos */
    const produtosParaEle = tamanhos.length > 0
      ? produtosDaMarca.filter(p =>
          (p.tamanhos as TamanhoItem[]).some(t =>
            t.qtd > 0 && tamanhos.some(tam => t.tamanho.toUpperCase() === tam.toUpperCase())
          )
        )
      : produtosDaMarca

    const qtdDisponivel = produtosParaEle.length || produtosDaMarca.length
    const labelNivel = nivel === 'fa_absoluto' ? 'fã absoluto' : nivel === 'fiel' ? 'cliente fiel' : 'prefere'

    const emoji = nivel === 'fa_absoluto' ? '🔥' : nivel === 'fiel' ? '⭐' : '💡'

    alertas.push(
      `${emoji} *${nome}* (${labelNivel} de ${marca})\n` +
      `   Temos ${qtdDisponivel} opção(ões) de ${marca} em estoque` +
      (tamanhos.length > 0 ? ` no tamanho dele (${tamanhos.join('/')})` : '') +
      `.\n   👉 _Quer mandar uma oferta personalizada pra ele?_`
    )
  }

  return alertas
}

/* ─── 2. CLIENTES INATIVOS ────────────────────────────────────────────── */
async function clientesInativos(admin: SupabaseClient, userId: string): Promise<string | null> {
  const limite30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const limite60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const { data: vendas } = await admin
    .from('vendas')
    .select('cliente_id, total, created_at')
    .eq('user_id', userId)
    .neq('status', 'cancelada')
    .gte('created_at', limite60)

  if (!vendas?.length) return null

  /* Agrupa por cliente: último pedido e ticket médio */
  const porCliente = new Map<string, { ultima: string; total: number; qtd: number }>()
  for (const v of vendas) {
    if (!v.cliente_id) continue
    const ex = porCliente.get(v.cliente_id)
    const data = v.created_at
    porCliente.set(v.cliente_id, {
      ultima: ex ? (data > ex.ultima ? data : ex.ultima) : data,
      total:  (ex?.total ?? 0) + Number(v.total),
      qtd:    (ex?.qtd   ?? 0) + 1,
    })
  }

  /* Clientes que compraram, mas a última compra foi há mais de 30 dias */
  const inativos = [...porCliente.entries()]
    .filter(([, d]) => d.ultima < limite30)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)

  if (!inativos.length) return null

  const ids = inativos.map(([id]) => id)
  const { data: clientesDados } = await admin
    .from('clientes').select('id, nome').eq('user_id', userId).in('id', ids)
  const nomes = new Map((clientesDados ?? []).map(c => [c.id, c.nome]))

  const lista = inativos.map(([id, d]) =>
    `   • ${nomes.get(id) ?? id} — R$${d.total.toFixed(0)} em ${d.qtd} pedido(s), sumiu há ${Math.floor((Date.now() - new Date(d.ultima).getTime()) / 86400000)} dias`
  ).join('\n')

  return `😴 *Clientes inativos (sem compra há +30 dias):*\n${lista}\n   👉 _Quer que eu monte uma campanha de reativação?_`
}

/* ─── 3. ESTOQUE CRÍTICO DE PRODUTOS QUE VENDEM BEM ─────────────────── */
async function estoqueCriticoComDemanda(admin: SupabaseClient, userId: string): Promise<string | null> {
  const limite60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: estoqueItems }, { data: vendasRecentes }] = await Promise.all([
    admin.from('estoque').select('id, nome, marca, cor, tamanhos').eq('user_id', userId).eq('status', 'disponivel'),
    admin.from('vendas').select('items').eq('user_id', userId).neq('status', 'cancelada').gte('created_at', limite60),
  ])

  if (!estoqueItems?.length || !vendasRecentes?.length) return null

  /* Conta quantas vezes cada produto apareceu em vendas */
  const vendidosCount = new Map<string, number>()
  for (const venda of vendasRecentes) {
    const items = Array.isArray(venda.items) ? venda.items : []
    for (const item of items) {
      const id = item?.produto_id ?? item?.estoque_id ?? item?.id
      if (id) vendidosCount.set(id, (vendidosCount.get(id) ?? 0) + 1)
    }
  }

  /* Produtos com estoque crítico (≤2 unidades) que venderam ≥2x nos últimos 60 dias */
  const criticos: string[] = []
  for (const item of estoqueItems) {
    const totalQtd = (item.tamanhos as TamanhoItem[]).reduce((s, t) => s + (t.qtd || 0), 0)
    const vendasQtd = vendidosCount.get(item.id) ?? 0
    if (totalQtd <= 2 && vendasQtd >= 2) {
      const cor = item.cor ? ` ${item.cor}` : ''
      criticos.push(`   • ${item.nome}${cor} — só ${totalQtd} un. no estoque, vendeu ${vendasQtd}x em 60 dias`)
    }
  }

  if (!criticos.length) return null

  return `⚠️ *Produtos quentes acabando:*\n${criticos.join('\n')}\n   👉 _Hora de repor antes de perder venda!_`
}

/* ─── 4. ANIVERSARIANTES DA SEMANA ───────────────────────────────────── */
async function aniversariantesSemana(admin: SupabaseClient, userId: string): Promise<string | null> {
  const hoje = new Date()
  const diasSemana: { mes: number; dia: number }[] = []
  for (let i = 0; i <= 6; i++) {
    const d = new Date(hoje.getTime() + i * 86400000)
    diasSemana.push({ mes: d.getMonth() + 1, dia: d.getDate() })
  }

  const { data: clientes } = await admin
    .from('clientes')
    .select('nome, data_nascimento, telefone')
    .eq('user_id', userId)
    .not('data_nascimento', 'is', null)

  if (!clientes?.length) return null

  const aniversariantes = clientes.filter(c => {
    if (!c.data_nascimento) return false
    const d = new Date(c.data_nascimento)
    return diasSemana.some(s => s.mes === d.getMonth() + 1 && s.dia === d.getDate())
  })

  if (!aniversariantes.length) return null

  const lista = aniversariantes.map(c => {
    const d = new Date(c.data_nascimento)
    const dia = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return `   • ${c.nome} — ${dia}`
  }).join('\n')

  return `🎂 *Aniversariantes essa semana:*\n${lista}\n   👉 _Quer que eu mande uma mensagem especial pra cada um?_`
}

/* ─── PRINCIPAL ───────────────────────────────────────────────────────── */
export async function rodarProativo(
  admin: SupabaseClient,
  userId: string,
  ownerPhone: string
): Promise<{ rodou: boolean; alertas: number }> {

  const [oportunidades, inativos, critico, aniversarios] = await Promise.all([
    oportunidadesMarca(admin, userId),
    clientesInativos(admin, userId),
    estoqueCriticoComDemanda(admin, userId),
    aniversariantesSemana(admin, userId),
  ])

  const partes: string[] = []
  if (oportunidades.length) partes.push(...oportunidades)
  if (inativos)    partes.push(inativos)
  if (critico)     partes.push(critico)
  if (aniversarios) partes.push(aniversarios)

  if (!partes.length) {
    /* Sem alertas hoje — manda resumo rápido se tiver dados */
    await sendWhatsAppMessage({
      phone: ownerPhone,
      message: `🤖 *Zivo — Bom dia!*\n\nAnalisei tudo aqui e hoje está tudo em dia. Nenhuma ação urgente por enquanto. Boas vendas! 💪`,
    })
    return { rodou: true, alertas: 0 }
  }

  /* Monta a mensagem final com IA pra soar natural */
  const resumoBruto = partes.join('\n\n')
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Você é o Zivo, assistente inteligente de uma loja de roupas. Mande um resumo matinal pro dono (Moca) com as oportunidades do dia. Tom: direto, animado, como um sócio que quer crescer junto.

DADOS ANALISADOS:
${resumoBruto}

Formate assim:
🤖 *Zivo — Bom dia, Moca!*

Analisei a loja e encontrei ${partes.length} oportunidade(s) pra hoje:

[inclua os dados acima de forma natural, mantendo os emojis e as sugestões de ação]

Responda com o número da ação que quer executar ou me diga qual priorizar. 💪`,
    }],
  })

  const msgFinal = (res.content[0] as { text: string }).text.trim()

  await sendWhatsAppMessage({ phone: ownerPhone, message: msgFinal })

  /* Registra que rodou hoje */
  await admin.from('loja_config').update({
    proativo_ultimo_run: new Date().toISOString(),
  }).eq('user_id', userId)

  return { rodou: true, alertas: partes.length }
}
