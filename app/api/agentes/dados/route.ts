import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const contatoId: string | undefined = body?.contatoId
  const userId: string | undefined = body?.userId ?? process.env.WHATSAPP_USER_ID

  if (!contatoId || !userId) {
    return NextResponse.json({ ok: false, error: 'contatoId e userId obrigatórios' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Carrega as últimas 30 mensagens do contato */
  const { data: msgs } = await supabase
    .from('whatsapp_mensagens')
    .select('direcao, conteudo, tipo, timestamp')
    .eq('contato_id', contatoId)
    .order('timestamp', { ascending: false })
    .limit(30)

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'sem mensagens' })
  }

  /* Carrega dados do contato e cliente vinculado */
  const { data: contato } = await supabase
    .from('whatsapp_contatos')
    .select('nome, phone, funil_etapa, cliente_id')
    .eq('id', contatoId)
    .single()

  let historicoCompras = ''
  if (contato?.cliente_id) {
    const { data: compras } = await supabase
      .from('vendas')
      .select('created_at, total, forma_pagamento, produtos')
      .eq('cliente_id', contato.cliente_id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (compras && compras.length > 0) {
      historicoCompras = '\n\nHistórico de compras:\n' + compras.map(c =>
        `- ${new Date(c.created_at).toLocaleDateString('pt-BR')}: R$${c.total} (${c.forma_pagamento})`
      ).join('\n')
    }
  }

  const conversa = [...msgs].reverse().map(m =>
    `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo ?? `[${m.tipo}]`}`
  ).join('\n')

  const prompt = `Você é o Agente de Dados do Zivo, sistema de gestão de loja de roupas.

Analise a conversa abaixo com o contato "${contato?.nome ?? 'Desconhecido'}" e extraia um perfil estruturado.${historicoCompras}

CONVERSA:
${conversa}

Responda APENAS com JSON válido neste formato exato:
{
  "marcas_interesse": ["lista de marcas mencionadas ou inferidas"],
  "tamanhos": ["tamanhos mencionados"],
  "ocasioes": ["trabalho", "casual", "social", "presente", etc],
  "perfil_compra": "impulsivo | planejado | promocao | presente",
  "temperatura": "frio | morno | quente",
  "resumo": "1-2 frases descrevendo o perfil e momento de compra deste cliente",
  "consulta_produto": {
    "ativo": true,
    "produto": "ex: polo, camisa, calça",
    "marca": "ex: Aramis",
    "cor": "ex: preta",
    "tamanho": "ex: P"
  },
  "alertas": [
    {
      "tipo": "oportunidade | cobranca | relacionamento | campanha",
      "mensagem": "descrição do alerta para o supervisor",
      "urgencia": "baixa | media | alta"
    }
  ]
}

Regras:
- temperatura "quente" = demonstrou interesse real em comprar agora
- temperatura "morno" = curioso mas sem urgência
- temperatura "frio" = só respondeu ou sem interesse claro
- consulta_produto.ativo = true APENAS se o cliente perguntou explicitamente se tem algum produto (ex: "tem polo da Aramis?", "procuro camisa M")
- alertas: gere APENAS se houver algo realmente relevante
- Se não tiver dados suficientes para um campo, use null ou []`

  let parsed: Record<string, unknown>
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (res.content[0] as { text: string }).text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch (err) {
    console.error('Agente dados - erro IA:', err)
    return NextResponse.json({ ok: false, error: 'Erro na análise IA' }, { status: 500 })
  }

  /* Salva/atualiza insights do contato */
  await supabase.from('contato_insights').upsert({
    user_id:              userId,
    contato_id:           contatoId,
    cliente_id:           contato?.cliente_id ?? null,
    marcas_interesse:     parsed.marcas_interesse ?? [],
    tamanhos:             parsed.tamanhos ?? [],
    ocasioes:             parsed.ocasioes ?? [],
    perfil_compra:        parsed.perfil_compra ?? null,
    temperatura:          parsed.temperatura ?? null,
    resumo:               parsed.resumo ?? null,
    ultima_analise:       new Date().toISOString(),
    mensagens_analisadas: msgs.length,
    raw:                  parsed,
    updated_at:           new Date().toISOString(),
  }, { onConflict: 'contato_id' })

  /* Registra log + incrementa execuções do agente */
  const { data: agente } = await supabase
    .from('agentes')
    .upsert({
      user_id:   userId,
      tipo:      'dados',
      nome:      'Agente de Dados',
      descricao: 'Analisa conversas e extrai perfil de cada contato automaticamente',
      ativo:     true,
      ultima_execucao:    new Date().toISOString(),
      total_execucoes:    1,
    }, { onConflict: 'user_id,tipo', ignoreDuplicates: false })
    .select('id')
    .single()

  if (agente?.id) {
    /* Incrementa contador via SQL direto */
    await supabase.from('agentes')
      .update({ ultima_execucao: new Date().toISOString() })
      .eq('id', agente.id)
    await supabase.from('agentes')
      .select('total_execucoes')
      .eq('id', agente.id)
      .single()
      .then(({ data: a }) => {
        if (a) supabase.from('agentes').update({ total_execucoes: (a.total_execucoes as number) + 1 }).eq('id', agente.id)
      })

    /* Salva alertas proativos como logs para o supervisor ver */
    const alertas = Array.isArray(parsed.alertas) ? parsed.alertas as Array<{tipo:string;mensagem:string;urgencia:string}> : []
    for (const alerta of alertas) {
      if (!alerta?.mensagem) continue
      await supabase.from('agente_logs').insert({
        user_id:    userId,
        agente_id:  agente.id,
        contato_id: contatoId,
        acao:       `[${alerta.tipo?.toUpperCase() ?? 'ALERTA'}] ${alerta.mensagem}`,
        resultado:  { urgencia: alerta.urgencia, contato: contato?.nome, tipo: alerta.tipo, mensagem: alerta.mensagem },
      })
    }
  }

  /* Pipeline: se cliente perguntou sobre produto, consulta Agente de Estoque */
  const consulta = parsed.consulta_produto as Record<string, unknown> | null | undefined
  if (consulta?.ativo && agente?.id) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'

    const estoqueRes = await fetch(`${baseUrl}/api/agentes/estoque`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        produto: consulta.produto ?? null,
        marca:   consulta.marca ?? null,
        cor:     consulta.cor ?? null,
        tamanho: consulta.tamanho ?? null,
      }),
    })
    const estoque = await estoqueRes.json().catch(() => ({ encontrou: false }))

    /* Gera sugestão de resposta com IA */
    const nomeCliente = contato?.nome?.split(' ')[0] ?? 'Olá'
    const promptResposta = estoque.encontrou
      ? `Você é atendente de loja de roupas. Cliente chamado ${nomeCliente} perguntou sobre: ${consulta.produto} ${consulta.marca ?? ''} ${consulta.cor ?? ''} tamanho ${consulta.tamanho ?? ''}.

Produtos disponíveis no estoque:
${estoque.resumo}

Escreva UMA resposta curta, amigável e direta para WhatsApp (máx 2 linhas). Confirme que tem o produto, informe opções disponíveis e pergunte se quer reservar. Use o nome do cliente.`
      : `Você é atendente de loja de roupas. Cliente chamado ${nomeCliente} perguntou sobre: ${consulta.produto} ${consulta.marca ?? ''} ${consulta.cor ?? ''} tamanho ${consulta.tamanho ?? ''}.

Não temos esse produto no estoque. Escreva UMA resposta curta e amigável para WhatsApp (máx 2 linhas) informando que não temos no momento e se quiser pode perguntar sobre outras opções similares.`

    const respostaIA = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: promptResposta }],
    })
    const sugestao = (respostaIA.content[0] as { text: string }).text.trim()

    /* Salva como alerta especial de sugestão de resposta */
    await supabase.from('agente_logs').insert({
      user_id:    userId,
      agente_id:  agente.id,
      contato_id: contatoId,
      acao:       `[SUGESTÃO] ${sugestao}`,
      resultado: {
        tipo:           'sugestao_resposta',
        urgencia:       'alta',
        sugestao,
        contato:        contato?.nome,
        contato_id:     contatoId,
        encontrou:      estoque.encontrou,
        produtos:       estoque.itens ?? [],
        consulta,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    perfil: {
      temperatura:  parsed.temperatura,
      resumo:       parsed.resumo,
      alertas:      parsed.alertas,
    },
  })
}
