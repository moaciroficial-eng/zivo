import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { userId, mensagem, ownerPhone } = await request.json()
  if (!userId || !mensagem || !ownerPhone) return NextResponse.json({ ok: false })

  /* Ignora mensagens de 1-2 caracteres (?, ok, thumbs) */
  if (mensagem.trim().length <= 2) return NextResponse.json({ ok: true, skipped: 'short' })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Zivo como assistente conversacional do dono */
  const decisao = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Você é o Zivo, assistente pessoal do dono da loja MADS de roupas.

PERSONALIDADE: direto, natural, inteligente — conversa como pessoa, não como bot.

Mensagem do dono: "${mensagem}"

Decida o que fazer e responda em JSON:
{
  "resposta": "sua resposta natural aqui (sempre preencha isso)",
  "buscar_dados": false,
  "tipo": null,
  "filtro": null,
  "acao": null
}

Regras:
- Conversa normal (oi, obrigado, tudo bem, etc.) → só responda naturalmente, buscar_dados: false
- Pergunta sobre vendas → buscar_dados: true, tipo: "vendas_hoje" | "vendas_semana" | "vendas_mes"
- Pergunta sobre estoque/produto → buscar_dados: true, tipo: "estoque", filtro: "nome do produto"
- Pergunta sobre cliente → buscar_dados: true, tipo: "clientes", filtro: "nome do cliente"
- Pausar atendimento → acao: "pausar", buscar_dados: false
- Ativar atendimento → acao: "ativar", buscar_dados: false
- Dúvidas gerais sobre a loja → responda com base no que você sabe, sem buscar dados`,
    }],
  })

  const text = (decisao.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null

  if (!acao) {
    await sendWhatsAppMessage({ phone: ownerPhone, message: 'Entendi! Mas não consegui processar agora. Tenta de novo.' })
    return NextResponse.json({ ok: false })
  }

  let respostaFinal = acao.resposta ?? ''

  /* Busca dados se necessário */
  if (acao.buscar_dados && acao.tipo) {
    if (acao.tipo.startsWith('vendas')) {
      const agora = new Date()
      let inicio: string
      if (acao.tipo === 'vendas_hoje') {
        inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()
      } else if (acao.tipo === 'vendas_semana') {
        const d = new Date(agora); d.setDate(d.getDate() - 7); inicio = d.toISOString()
      } else {
        const d = new Date(agora); d.setDate(1); inicio = d.toISOString()
      }

      const { data: vendas } = await admin.from('vendas')
        .select('total, status')
        .eq('user_id', userId)
        .gte('created_at', inicio)

      const periodo = acao.tipo === 'vendas_hoje' ? 'hoje' : acao.tipo === 'vendas_semana' ? 'essa semana' : 'esse mês'
      if (!vendas?.length) {
        respostaFinal = `📊 Nenhuma venda registrada ${periodo}.`
      } else {
        const ok = vendas.filter(v => v.status !== 'cancelada')
        const total = ok.reduce((s, v) => s + (Number(v.total) || 0), 0)
        respostaFinal = `📊 *Vendas ${periodo}*\nTotal: R$ ${total.toFixed(2)} | ${ok.length} venda(s) | Ticket médio: R$ ${ok.length ? (total / ok.length).toFixed(2) : '0,00'}`
      }

    } else if (acao.tipo === 'estoque') {
      type TamanhoItem = { tamanho: string; qtd: number }
      type EstoqueItem = { id: string; nome: string; cor: string | null; tamanhos: TamanhoItem[]; preco_venda: number }

      const filtro = acao.filtro ?? ''
      const [r1, r2] = await Promise.all([
        admin.from('estoque').select('id,nome,cor,tamanhos,preco_venda')
          .eq('user_id', userId).eq('status', 'disponivel').ilike('nome', `%${filtro}%`).limit(100),
        admin.from('estoque').select('id,nome,cor,tamanhos,preco_venda')
          .eq('user_id', userId).eq('status', 'disponivel').ilike('marca', `%${filtro}%`).limit(100),
      ])

      const visto = new Set<string>()
      const itens: EstoqueItem[] = []
      for (const { data } of [r1, r2]) {
        for (const item of (data ?? []) as EstoqueItem[]) {
          if (!visto.has(item.id)) { visto.add(item.id); itens.push(item) }
        }
      }

      const comEstoque = itens.filter(i => (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0))
      if (!comEstoque.length) {
        respostaFinal = `📦 Nenhum produto encontrado para "${filtro}".`
      } else {
        const lista = comEstoque.map(i => {
          const tam = (i.tamanhos as TamanhoItem[]).filter(t => t.qtd > 0).map(t => `${t.tamanho}(${t.qtd})`).join(' ')
          const cor = i.cor ? ` ${i.cor}` : ''
          return `• ${i.nome}${cor} — ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
        }).join('\n')
        respostaFinal = `📦 *${filtro || 'Estoque'}*\n${lista}`
      }

    } else if (acao.tipo === 'clientes') {
      const { data: clientes } = await admin.from('clientes')
        .select('nome, telefone, email')
        .eq('user_id', userId)
        .ilike('nome', `%${acao.filtro ?? ''}%`)
        .limit(5)

      if (!clientes?.length) {
        respostaFinal = `👤 Nenhum cliente encontrado para "${acao.filtro ?? ''}".`
      } else {
        respostaFinal = `👤 *Clientes:*\n` + clientes.map(c =>
          `• ${c.nome}${c.telefone ? ` — ${c.telefone}` : ''}${c.email ? ` — ${c.email}` : ''}`
        ).join('\n')
      }
    }
  }

  /* Ações de configuração */
  if (acao.acao === 'pausar') {
    await admin.from('loja_config').upsert(
      { user_id: userId, ativo: false, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    respostaFinal = '⏸️ Atendimento automático pausado. Manda "ativa o atendimento" para religar.'
  } else if (acao.acao === 'ativar') {
    await admin.from('loja_config').upsert(
      { user_id: userId, ativo: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    respostaFinal = '▶️ Atendimento automático ativado!'
  }

  if (respostaFinal) {
    try { await sendWhatsAppMessage({ phone: ownerPhone, message: respostaFinal }) }
    catch (err) { return NextResponse.json({ ok: false, error: String(err) }) }
  }

  return NextResponse.json({ ok: true, resposta: respostaFinal })
}
