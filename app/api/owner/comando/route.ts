import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { gerarRelatorio, diagnosticoCompleto } from '@/lib/agentes/analitico'
import { situacaoFinanceira, definirMeta } from '@/lib/agentes/financeiro'
import { planoSemana, analisarCrescimento } from '@/lib/agentes/estrategista'
import { diagnosticoEstoque, buscarProduto } from '@/lib/agentes/estoquista'
import { salvarAprendizado, carregarConhecimento } from '@/lib/conhecimento'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { userId, mensagem, ownerPhone } = await request.json()
  if (!userId || !mensagem || !ownerPhone) return NextResponse.json({ ok: false })
  if (mensagem.trim().length <= 2) return NextResponse.json({ ok: true, skipped: 'short' })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Detecta comando "aprende:" antes de passar pela IA */
  const textoLimpo = mensagem.trim()
  if (/^aprende[:\s]/i.test(textoLimpo)) {
    const conteudo = textoLimpo.replace(/^aprende[:\s]*/i, '').trim()
    if (conteudo.length > 3) {
      const confirmacao = await salvarAprendizado(admin, userId, conteudo)
      await sendWhatsAppMessage({ phone: ownerPhone, message: confirmacao })
      return NextResponse.json({ ok: true, acao: 'aprendizado' })
    }
  }

  /* Carrega conhecimento da loja para contexto do classificador */
  const conhecimento = await carregarConhecimento(admin, userId)

  /* Zivo como assistente inteligente do dono — decide o que fazer */
  const decisao = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Você é o Zivo, assistente pessoal inteligente do dono de uma loja de roupas.
${conhecimento ? `\n${conhecimento}\n` : ''}
Analise a mensagem e decida a ação correta.

Mensagem: "${mensagem}"

Retorne JSON:
{
  "acao": "conversa" | "vendas_hoje" | "relatorio_semana" | "relatorio_mes" | "diagnostico" | "financeiro" | "meta" | "plano_semana" | "crescimento" | "estoque_diagnostico" | "estoque_busca" | "clientes" | "pausar" | "ativar",
  "resposta_direta": "se for só conversa, responda aqui naturalmente. Senão deixe null",
  "filtro": "produto ou cliente buscado (se aplicável)",
  "valor": número se for definir meta, senão null
}

Exemplos:
- "oi tudo bem" → acao: conversa, resposta_direta: "Oi! Tudo ótimo por aqui. Como posso ajudar?"
- "obrigado" → acao: conversa, resposta_direta: "De nada! 😊"
- "como foi a semana" → acao: relatorio_semana
- "relatório do mês" → acao: relatorio_mes
- "me dá um diagnóstico" → acao: diagnostico
- "como tá o financeiro" → acao: financeiro
- "meta de 5000 esse mês" → acao: meta, valor: 5000
- "plano pra essa semana" → acao: plano_semana
- "como tá o crescimento" → acao: crescimento
- "situação do estoque" → acao: estoque_diagnostico
- "tem camiseta M" → acao: estoque_busca, filtro: "camiseta M"
- "quanto vendemos hoje" | "vendas de hoje" | "resumo do dia" → acao: vendas_hoje
- "quanto vendemos" | "quanto vendemos esse mês" → acao: financeiro
- "clientes inativos" → acao: clientes
- "pausa o atendimento" → acao: pausar
- "ativa o atendimento" → acao: ativar
- "aprende algo" ou "salva isso" → acao: conversa (já tratado antes)`,
    }],
  })

  const text = (decisao.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const cmd = jsonMatch ? JSON.parse(jsonMatch[0]) : { acao: 'conversa', resposta_direta: 'Entendi! Como posso ajudar?' }

  let resposta = ''

  try {
    switch (cmd.acao) {
      case 'conversa':
        resposta = cmd.resposta_direta ?? 'Como posso ajudar?'
        break

      case 'vendas_hoje': {
        const hoje = new Date()
        const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString()
        const { data: vendasHoje } = await admin
          .from('vendas').select('valor, cliente_nome, produtos, created_at')
          .eq('user_id', userId).gte('created_at', inicioDia)
          .order('created_at', { ascending: false })
        const total = (vendasHoje ?? []).reduce((s: number, v: { valor: number }) => s + (Number(v.valor) || 0), 0)
        const qtd = vendasHoje?.length ?? 0
        if (qtd === 0) {
          resposta = `📊 *Vendas de hoje*\n\nNenhuma venda registrada ainda hoje.`
        } else {
          const lista = (vendasHoje ?? []).slice(0, 10).map((v: { cliente_nome: string; valor: number }) =>
            `• ${v.cliente_nome ?? 'Avulso'} — R$${Number(v.valor).toFixed(2)}`
          ).join('\n')
          resposta = `📊 *Vendas de hoje*\n\n💰 Total: R$${total.toFixed(2)} | ${qtd} venda(s)\n\n${lista}`
        }
        break
      }

      case 'relatorio_semana':
        resposta = await gerarRelatorio(admin, userId, 'semana')
        break

      case 'relatorio_mes':
        resposta = await gerarRelatorio(admin, userId, 'mes')
        break

      case 'diagnostico':
        resposta = await diagnosticoCompleto(admin, userId)
        break

      case 'financeiro':
        resposta = await situacaoFinanceira(admin, userId)
        break

      case 'meta':
        if (cmd.valor && cmd.valor > 0) {
          resposta = await definirMeta(admin, userId, Number(cmd.valor))
        } else {
          resposta = 'Qual o valor da meta? Ex: "meta de R$5000 esse mês"'
        }
        break

      case 'plano_semana':
        resposta = await planoSemana(admin, userId)
        break

      case 'crescimento':
        resposta = await analisarCrescimento(admin, userId)
        break

      case 'estoque_diagnostico':
        resposta = await diagnosticoEstoque(admin, userId)
        break

      case 'estoque_busca':
        resposta = await buscarProduto(admin, userId, cmd.filtro ?? '')
        break

      case 'clientes': {
        const { data: inativos } = await admin
          .from('clientes').select('nome, telefone')
          .eq('user_id', userId)
          .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(10)
        if (!inativos?.length) {
          resposta = '👥 Nenhum cliente inativo encontrado (todos interagiram nos últimos 30 dias).'
        } else {
          resposta = `👥 *Clientes inativos (+30 dias)*\n\n` +
            inativos.map((c: { nome: string; telefone: string }) => `• ${c.nome}${c.telefone ? ` — ${c.telefone}` : ''}`).join('\n') +
            `\n\n💡 Sugestão: manda uma campanha de reativação pra eles.`
        }
        break
      }

      case 'pausar':
        await admin.from('loja_config').upsert(
          { user_id: userId, ativo: false, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        resposta = '⏸️ Atendimento automático *pausado*. Manda "ativa o atendimento" para religar.'
        break

      case 'ativar':
        await admin.from('loja_config').upsert(
          { user_id: userId, ativo: true, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        resposta = '▶️ Atendimento automático *ativado*!'
        break

      default:
        resposta = cmd.resposta_direta ?? 'Pode me dizer mais? Não entendi bem o que precisa.'
    }
  } catch (err) {
    console.error('[owner/comando] erro no agente:', err)
    resposta = 'Algo deu errado ao processar. Tenta de novo em instantes.'
  }

  if (resposta) {
    try { await sendWhatsAppMessage({ phone: ownerPhone, message: resposta }) }
    catch (err) { return NextResponse.json({ ok: false, error: String(err) }) }
  }

  return NextResponse.json({ ok: true, acao: cmd.acao })
}
