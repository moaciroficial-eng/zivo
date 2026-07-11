/* ══════════════════════════════════════════════════════════════
   RESULTADO DO ZIVO — atribuição de vendas

   Venda atribuída: o cliente recebeu uma mensagem do Zivo (aprovada
   pelo dono ou automática) e comprou em até 7 dias. É a métrica que
   prova o retorno da assinatura em reais.

   Calculado on-the-fly a partir de inteligencia_acoes × vendas —
   sem mudança de schema.
   ══════════════════════════════════════════════════════════════ */

const JANELA_ATRIBUICAO_DIAS = 7

type Acao = { cliente_id: string | null; mensagem: string; enviada_em: string }
type Venda = { cliente_id: string | null; cliente_nome: string; valor: number; created_at: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resultadoZivo(admin: any, userId: string, dias = 30): Promise<string> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const { data: acoes } = await admin
    .from('inteligencia_acoes')
    .select('cliente_id, mensagem, enviada_em')
    .eq('user_id', userId)
    .gte('enviada_em', desde)
    .limit(500)

  const listaAcoes = (acoes ?? []) as Acao[]
  if (listaAcoes.length === 0) {
    return `🤖 *Resultado do Zivo — últimos ${dias} dias*\n\nAinda não enviei mensagens aprovadas nesse período. Aprova as sugestões do resumo diário que eu começo a trabalhar! 💪`
  }

  const clienteIds = [...new Set(listaAcoes.map(a => a.cliente_id).filter(Boolean))] as string[]

  const { data: vendas } = await admin
    .from('vendas')
    .select('cliente_id, cliente_nome, valor, created_at')
    .eq('user_id', userId)
    .in('cliente_id', clienteIds)
    .gte('created_at', desde)
    .limit(1000)

  /* Atribui: venda até 7 dias depois de alguma mensagem pro mesmo cliente */
  const atribuidas: Venda[] = []
  for (const v of (vendas ?? []) as Venda[]) {
    if (!v.cliente_id) continue
    const tVenda = new Date(v.created_at).getTime()
    const temAcaoAntes = listaAcoes.some(a => {
      if (a.cliente_id !== v.cliente_id) return false
      const tAcao = new Date(a.enviada_em).getTime()
      return tAcao <= tVenda && tVenda - tAcao <= JANELA_ATRIBUICAO_DIAS * 86400000
    })
    if (temAcaoAntes) atribuidas.push(v)
  }

  const totalAtribuido = atribuidas.reduce((s, v) => s + (Number(v.valor) || 0), 0)
  const clientesAlcancados = clienteIds.length

  if (atribuidas.length === 0) {
    return `🤖 *Resultado do Zivo — últimos ${dias} dias*\n\n📤 ${listaAcoes.length} mensagem(ns) enviadas para ${clientesAlcancados} cliente(s)\n💰 Nenhuma venda atribuída ainda (janela de ${JANELA_ATRIBUICAO_DIAS} dias após a mensagem)\n\nSemente plantada — as vendas costumam vir nos dias seguintes. 🌱`
  }

  const lista = atribuidas
    .sort((a, b) => Number(b.valor) - Number(a.valor))
    .slice(0, 8)
    .map(v => `• ${v.cliente_nome ?? 'Cliente'} — R$${Number(v.valor).toFixed(2)}`)
    .join('\n')

  return `🤖 *Resultado do Zivo — últimos ${dias} dias*

📤 ${listaAcoes.length} mensagem(ns) enviadas para ${clientesAlcancados} cliente(s)
🛍️ *${atribuidas.length} venda(s) atribuída(s)* (compra em até ${JANELA_ATRIBUICAO_DIAS} dias após a mensagem)
💰 *R$${totalAtribuido.toFixed(2)} gerados*

${lista}${atribuidas.length > 8 ? `\n...e mais ${atribuidas.length - 8}` : ''}`
}
