import { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function gerarRelatorio(admin: SupabaseClient, userId: string, periodo: 'semana' | 'mes' = 'semana'): Promise<string> {
  const agora = new Date()
  const dias = periodo === 'semana' ? 7 : 30
  const inicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString()
  const inicioAnterior = new Date(agora.getTime() - dias * 2 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: vendas },
    { data: vendasAnt },
    { data: clientesNovos },
    { data: estoque },
    { data: mensagens },
  ] = await Promise.all([
    admin.from('vendas').select('valor, produtos, cliente_id, created_at').eq('user_id', userId).gte('created_at', inicio),
    admin.from('vendas').select('valor').eq('user_id', userId).gte('created_at', inicioAnterior).lt('created_at', inicio),
    admin.from('clientes').select('id, nome').eq('user_id', userId).gte('created_at', inicio),
    admin.from('estoque').select('nome, cor, tamanhos, preco_venda, marca').eq('user_id', userId).eq('status', 'disponivel'),
    admin.from('whatsapp_mensagens').select('direcao').eq('user_id', userId).gte('timestamp', inicio),
  ])

  const ok = vendas ?? []
  const okAnt = vendasAnt ?? []
  const totalAtual = ok.reduce((s: number, v: { valor: number }) => s + (Number(v.valor) || 0), 0)
  const totalAnt = okAnt.reduce((s: number, v: { valor: number }) => s + (Number(v.valor) || 0), 0)
  const variacaoFat = totalAnt > 0 ? ((totalAtual - totalAnt) / totalAnt * 100).toFixed(0) : null
  const ticketMedio = ok.length ? (totalAtual / ok.length).toFixed(2) : '0,00'

  type TamanhoItem = { tamanho: string; qtd: number }
  const estoquesBaixos = (estoque ?? []).filter((e: { tamanhos: TamanhoItem[] }) =>
    (e.tamanhos as TamanhoItem[]).reduce((s: number, t: TamanhoItem) => s + (t.qtd || 0), 0) <= 3
  )

  const totalMensagens = (mensagens ?? []).length
  const msgRecebidas = (mensagens ?? []).filter((m: { direcao: string }) => m.direcao === 'recebida').length

  const contexto = `
PERÍODO: últimos ${dias} dias
VENDAS: ${ok.length} concluídas | Faturamento: R$ ${totalAtual.toFixed(2)} | Ticket médio: R$ ${ticketMedio}
COMPARATIVO: período anterior R$ ${totalAnt.toFixed(2)}${variacaoFat ? ` (${Number(variacaoFat) >= 0 ? '+' : ''}${variacaoFat}%)` : ''}
CLIENTES NOVOS: ${(clientesNovos ?? []).length}
WHATSAPP: ${totalMensagens} mensagens (${msgRecebidas} recebidas)
ESTOQUE CRÍTICO (≤3 unidades): ${estoquesBaixos.length} produto(s)
${estoquesBaixos.slice(0, 5).map((e: { nome: string; cor: string | null; tamanhos: TamanhoItem[] }) => {
  const total = (e.tamanhos as TamanhoItem[]).reduce((s: number, t: TamanhoItem) => s + (t.qtd || 0), 0)
  return `  • ${e.nome}${e.cor ? ` ${e.cor}` : ''}: ${total} un.`
}).join('\n')}
`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Você é o analista de negócios do Zivo. Gere um relatório objetivo e direto para o dono de uma loja de roupas.

DADOS:
${contexto}

FORMATO (use este exato, com emojis):
📊 *Relatório ${periodo === 'semana' ? 'Semanal' : 'Mensal'}*

💰 Faturamento: R$ X | X vendas | Ticket médio R$ X
📈 vs período anterior: +X% ou -X%
👥 Clientes novos: X
💬 Conversas WhatsApp: X

${estoquesBaixos.length > 0 ? '⚠️ Estoque crítico: [lista]' : '✅ Estoque: tudo OK'}

💡 Insight: [1 observação inteligente sobre o negócio baseada nos dados]
🎯 Ação sugerida: [1 ação concreta para essa semana]`,
    }],
  })

  return (res.content[0] as { text: string }).text.trim()
}

export async function diagnosticoCompleto(admin: SupabaseClient, userId: string): Promise<string> {
  const [
    { data: vendas30 },
    { data: clientes },
    { data: estoque },
    { data: contatos },
  ] = await Promise.all([
    admin.from('vendas').select('valor, produtos, created_at').eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    admin.from('clientes').select('id, nome, created_at').eq('user_id', userId),
    admin.from('estoque').select('nome, cor, tamanhos, preco_venda, marca').eq('user_id', userId).eq('status', 'disponivel'),
    admin.from('whatsapp_contatos').select('id').eq('user_id', userId),
  ])

  const ok = vendas30 ?? []
  const fat30 = ok.reduce((s: number, v: { valor: number }) => s + (Number(v.valor) || 0), 0)

  type TamanhoItem = { tamanho: string; qtd: number }
  const totalEstoque = (estoque ?? []).reduce((s: number, e: { tamanhos: TamanhoItem[] }) =>
    s + (e.tamanhos as TamanhoItem[]).reduce((ss: number, t: TamanhoItem) => ss + (t.qtd || 0), 0), 0)

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Você é um consultor sênior de varejo. Faça um diagnóstico honesto e estratégico desta loja.

DADOS (últimos 30 dias):
- Faturamento: R$ ${fat30.toFixed(2)} em ${ok.length} vendas
- Ticket médio: R$ ${ok.length ? (fat30 / ok.length).toFixed(2) : '0'}
- Base de clientes cadastrados: ${(clientes ?? []).length}
- Contatos no WhatsApp: ${(contatos ?? []).length}
- Produtos no estoque: ${(estoque ?? []).length} SKUs | ${totalEstoque} unidades totais

Seja direto, objetivo, com mentalidade de crescimento. Formato:
🔍 *Diagnóstico da Loja*

📌 Situação atual: [2 linhas honestas]
💪 Pontos fortes: [2 pontos]
⚠️ Pontos de atenção: [2 pontos]
🚀 3 ações prioritárias para crescer:
1. ...
2. ...
3. ...
💡 Potencial estimado: [se implementar essas ações, o que pode acontecer]`,
    }],
  })

  return (res.content[0] as { text: string }).text.trim()
}
