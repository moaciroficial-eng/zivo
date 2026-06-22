import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { userId, mensagem, ownerPhone } = await request.json()
  if (!userId || !mensagem || !ownerPhone) return NextResponse.json({ ok: false })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Interpreta o comando do dono */
  const interpretacao = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Você interpreta comandos de dono de loja de roupas.

Mensagem: "${mensagem}"

Classifique e retorne JSON:
{
  "tipo": "vendas" | "estoque" | "clientes" | "pausar" | "ativar" | "desconhecido",
  "periodo": "hoje" | "semana" | "mes" | null,
  "produto": "nome do produto ou null",
  "cliente": "nome do cliente ou null",
  "resumo": "o que o dono quer saber/fazer"
}

Exemplos:
- "quanto vendemos hoje" → tipo: vendas, periodo: hoje
- "tem camiseta preta?" → tipo: estoque, produto: camiseta preta
- "qual cadastro da Maria" → tipo: clientes, cliente: Maria
- "pausa o atendimento" → tipo: pausar
- "ativa o atendimento" → tipo: ativar
- "o que mais vendemos?" → tipo: vendas, periodo: mes`,
    }],
  })

  const text = (interpretacao.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const cmd = jsonMatch ? JSON.parse(jsonMatch[0]) : { tipo: 'desconhecido' }

  let resposta = ''

  if (cmd.tipo === 'vendas') {
    const agora = new Date()
    let inicio: string
    if (cmd.periodo === 'hoje') {
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()
    } else if (cmd.periodo === 'semana') {
      const d = new Date(agora); d.setDate(d.getDate() - 7); inicio = d.toISOString()
    } else {
      const d = new Date(agora); d.setDate(1); inicio = d.toISOString()
    }

    const { data: vendas } = await admin
      .from('vendas')
      .select('total, status, items')
      .eq('user_id', userId)
      .gte('created_at', inicio)

    if (!vendas?.length) {
      resposta = `📊 Nenhuma venda registrada ${cmd.periodo === 'hoje' ? 'hoje' : cmd.periodo === 'semana' ? 'essa semana' : 'esse mês'}.`
    } else {
      const concluidas = vendas.filter(v => v.status !== 'cancelada')
      const total = concluidas.reduce((s, v) => s + (Number(v.total) || 0), 0)
      resposta = `📊 *Vendas ${cmd.periodo === 'hoje' ? 'hoje' : cmd.periodo === 'semana' ? 'essa semana' : 'esse mês'}*\n\n`
      resposta += `Total: *R$ ${total.toFixed(2)}*\n`
      resposta += `Qtd: ${concluidas.length} venda(s)\n`
      resposta += `Ticket médio: R$ ${concluidas.length ? (total / concluidas.length).toFixed(2) : '0,00'}`
    }

  } else if (cmd.tipo === 'estoque') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
    const res = await fetch(`${baseUrl}/api/agentes/estoque`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, produto: cmd.produto }),
    })
    const data = await res.json()
    resposta = `📦 *Estoque: ${cmd.produto ?? 'consulta geral'}*\n\n${data.catalogo ?? 'Nada encontrado.'}`

  } else if (cmd.tipo === 'clientes') {
    const { data: clientes } = await admin
      .from('clientes')
      .select('nome, telefone, email')
      .eq('user_id', userId)
      .ilike('nome', `%${cmd.cliente ?? ''}%`)
      .limit(5)

    if (!clientes?.length) {
      resposta = `👤 Nenhum cliente encontrado para "${cmd.cliente ?? ''}".`
    } else {
      resposta = `👤 *Clientes encontrados:*\n\n`
      resposta += clientes.map(c => `• ${c.nome}${c.telefone ? ` — ${c.telefone}` : ''}${c.email ? ` — ${c.email}` : ''}`).join('\n')
    }

  } else if (cmd.tipo === 'pausar') {
    await admin.from('loja_config').upsert(
      { user_id: userId, ativo: false, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    resposta = '⏸️ Atendimento automático *pausado*. Manda "ativa o atendimento" para religar.'

  } else if (cmd.tipo === 'ativar') {
    await admin.from('loja_config').upsert(
      { user_id: userId, ativo: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    resposta = '▶️ Atendimento automático *ativado*!'

  } else {
    resposta = `❓ Não entendi o comando. Exemplos que funcionam:\n\n• "quanto vendemos hoje"\n• "tem camiseta no estoque?"\n• "qual cadastro da Maria"\n• "pausa o atendimento"\n• "ativa o atendimento"`
  }

  try {
    await sendWhatsAppMessage({ phone: ownerPhone, message: resposta })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }

  return NextResponse.json({ ok: true, tipo: cmd.tipo, resposta })
}
