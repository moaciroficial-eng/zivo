import { createClient as createAdmin } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET() {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const userId = process.env.WHATSAPP_USER_ID?.replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ erro: 'WHATSAPP_USER_ID ausente' })

  /* Primeiro enriquece os dados */
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  await fetch(`${baseUrl}/api/cron/enriquecer-insights`).catch(() => null)

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()

  const [{ data: insights }, { data: estoque }, { data: vendas }, { data: config }] = await Promise.all([
    admin.from('contato_insights')
      .select('contato_id, cliente_id, marca_principal, marcas_favoritas, tamanhos, classificacao, tendencia, total_gasto, qtd_compras, ticket_medio, dias_sem_comprar, ultima_compra')
      .eq('user_id', userId).limit(200),
    admin.from('estoque')
      .select('id, nome, marca, cor, tamanhos, preco_venda, status')
      .eq('user_id', userId).limit(500),
    admin.from('vendas')
      .select('valor, cliente_id, created_at')
      .eq('user_id', userId).gte('created_at', inicioMes),
    admin.from('loja_config').select('nome_loja').eq('user_id', userId).maybeSingle(),
  ])

  const { data: clientes } = await admin.from('clientes')
    .select('id, nome').eq('user_id', userId)
    .in('id', (insights ?? []).map(i => i.cliente_id).filter(Boolean) as string[])

  const clienteMap = new Map((clientes ?? []).map(c => [c.id, c.nome]))

  type TamanhoItem = { tamanho: string; qtd: number }
  const estoqueDisponivel = (estoque ?? []).filter(e =>
    (e.tamanhos as TamanhoItem[]).some(t => t.qtd > 0)
  )

  const faturamentoMes = (vendas ?? []).reduce((s, v) => s + Number(v.valor || 0), 0)
  const vendasMes = (vendas ?? []).length

  /* Monta contexto rico pro agente */
  const resumoClientes = (insights ?? []).map(i => {
    const nome = clienteMap.get(i.cliente_id) ?? 'Desconhecido'
    return `${nome} | ${i.classificacao} | R$${Number(i.total_gasto).toFixed(0)} total | ${i.qtd_compras}x compras | ${i.dias_sem_comprar ?? '?'}d sem comprar | marcas: ${(i.marcas_favoritas as string[] ?? []).join(', ')} | tamanhos: ${(i.tamanhos as string[] ?? []).join(', ')} | tendência: ${i.tendencia}`
  }).join('\n')

  const resumoEstoque = estoqueDisponivel.slice(0, 80).map(e => {
    const tam = (e.tamanhos as TamanhoItem[]).filter(t => t.qtd > 0)
    const total = tam.reduce((s, t) => s + t.qtd, 0)
    const detalhes = tam.map(t => `${t.tamanho}:${t.qtd}`).join(' ')
    return `${e.nome}${e.cor ? ` ${e.cor}` : ''} (${e.marca ?? '?'}) | ${detalhes} | total:${total} | R$${Number(e.preco_venda).toFixed(0)}`
  }).join('\n')

  const nomeLoja = config?.nome_loja ?? 'loja'

  const prompt = `Você é o agente de inteligência de negócios da ${nomeLoja}, uma loja de roupas.
Analise os dados abaixo e gere de 3 a 6 sugestões PROATIVAS e CRIATIVAS para o dono.

FATURAMENTO DO MÊS: R$${faturamentoMes.toFixed(2)} (${vendasMes} vendas)

CLIENTES (nome | classificação | total gasto | qtd compras | dias sem comprar | marcas favoritas | tamanhos | tendência):
${resumoClientes || '(sem dados ainda)'}

ESTOQUE DISPONÍVEL (produto | tamanhos:qtd | total | preço):
${resumoEstoque || '(sem dados)'}

CLASSIFICAÇÕES:
- vip: clientes de alto valor ou frequência
- fiel: compra regularmente
- ativo: comprou recentemente
- em_risco: 45-90 dias sem comprar
- perdido: +90 dias sem comprar

Gere sugestões que um gerente de vendas experiente e criativo daria. Pense em:
- Clientes VIP que merecem reconhecimento ou brinde
- Clientes em risco que precisam de reativação
- Cruzamentos de estoque x perfil de cliente (quem compraria o quê)
- Tendências de queda ou crescimento
- Oportunidades de cross-sell (quem comprou X pode querer Y)
- Clientes fiéis que nunca receberam nada especial

Responda em JSON:
{
  "sugestoes": [
    {
      "tipo": "vip|reativacao|campanha|brinde|cross_sell|tendencia|oportunidade",
      "titulo": "título curto e direto",
      "descricao": "descrição clara explicando o raciocínio e a oportunidade",
      "prioridade": 1,
      "acao": {
        "tipo": "campanha|mensagem_individual|alerta",
        "clientes": ["nome1", "nome2"],
        "sugestao_mensagem": "sugestão de mensagem pra enviar (se aplicável)"
      }
    }
  ]
}`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ ok: false, erro: 'IA sem JSON' })

  const { sugestoes } = JSON.parse(jsonMatch[0])

  /* Apaga sugestões pendentes antigas antes de inserir novas */
  await admin.from('agente_sugestoes').delete().eq('user_id', userId).eq('status', 'pendente')

  const rows = (sugestoes ?? []).map((s: {
    tipo: string; titulo: string; descricao: string; prioridade: number; acao: unknown
  }) => ({
    user_id: userId,
    tipo: s.tipo,
    titulo: s.titulo,
    descricao: s.descricao,
    prioridade: s.prioridade ?? 2,
    acao: s.acao ?? null,
    status: 'pendente',
  }))

  if (rows.length > 0) {
    await admin.from('agente_sugestoes').insert(rows)
  }

  return NextResponse.json({ ok: true, sugestoes: rows.length })
}
