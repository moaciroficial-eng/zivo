import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

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
  let marcasCompradas: Record<string, number> = {}
  let totalCompras = 0

  if (contato?.cliente_id) {
    const { data: compras } = await supabase
      .from('vendas')
      .select('created_at, valor, forma_pagamento, produtos')
      .eq('cliente_id', contato.cliente_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (compras && compras.length > 0) {
      totalCompras = compras.length

      /* Extrai marcas de cada venda */
      for (const venda of compras) {
        const items = Array.isArray(venda.produtos) ? venda.produtos : []
        for (const item of items) {
          const marca = item?.marca ?? item?.brand ?? null
          if (marca && typeof marca === 'string' && marca.trim()) {
            const m = marca.trim()
            marcasCompradas[m] = (marcasCompradas[m] ?? 0) + (item?.quantidade ?? 1)
          }
        }
      }

      const resumoMarcas = Object.entries(marcasCompradas)
        .sort((a, b) => b[1] - a[1])
        .map(([m, qtd]) => `${m}(${qtd}x)`)
        .join(', ')

      historicoCompras = `\n\nHistórico de compras (${totalCompras} pedidos):\n` +
        compras.slice(0, 5).map(c =>
          `- ${new Date(c.created_at).toLocaleDateString('pt-BR')}: R$${c.valor} (${c.forma_pagamento ?? '-'})`
        ).join('\n') +
        (resumoMarcas ? `\nMarcas compradas: ${resumoMarcas}` : '')
    }
  }

  const conversa = [...msgs].reverse().map(m =>
    `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo ?? `[${m.tipo}]`}`
  ).join('\n')

  /* Classifica o nível de fidelidade por marca */
  const marcasFavoritas = Object.entries(marcasCompradas)
    .sort((a, b) => b[1] - a[1])
    .map(([marca, qtd]) => ({
      marca,
      qtd,
      nivel: qtd >= 10 ? 'fa_absoluto' : qtd >= 5 ? 'fiel' : qtd >= 3 ? 'preferencia' : 'interesse',
    }))

  const contextoMarcas = marcasFavoritas.length > 0
    ? `\nPERFIL DE MARCA (baseado em ${totalCompras} compras reais):\n` +
      marcasFavoritas.map(m => `- ${m.marca}: ${m.qtd}x comprado → ${m.nivel}`).join('\n')
    : ''

  const prompt = `Você é o Agente de Dados do Zivo, sistema de gestão de loja de roupas.

Analise o contato "${contato?.nome ?? 'Desconhecido'}" com base na conversa e no histórico de compras.${historicoCompras}${contextoMarcas}

CONVERSA ATUAL:
${conversa}

Responda APENAS com JSON válido neste formato exato:
{
  "marcas_interesse": ["marcas mencionadas na conversa atual"],
  "marcas_favoritas": ["marcas mais compradas em ordem, ex: Aramis, Tommy"],
  "fidelidade_marca": "fa_absoluto | fiel | preferencia | variado | sem_historico",
  "marca_principal": "marca mais comprada ou null",
  "tamanhos": ["tamanhos mencionados"],
  "ocasioes": ["trabalho", "casual", "social", "presente", etc],
  "perfil_compra": "impulsivo | planejado | promocao | presente",
  "temperatura": "frio | morno | quente",
  "resumo": "1-2 frases descrevendo o perfil, marca favorita e momento de compra",
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
    marcas_favoritas:     parsed.marcas_favoritas ?? [],
    marca_principal:      parsed.marca_principal ?? null,
    fidelidade_marca:     parsed.fidelidade_marca ?? 'sem_historico',
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
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
    const nomeCliente = contato?.nome?.split(' ')[0] ?? ''
    const clientePediu = `${consulta.produto ?? ''} ${consulta.cor ?? ''} ${consulta.marca ?? ''} tamanho ${consulta.tamanho ?? ''}`.trim()

    const promptResposta = `Você é o Agente Vendedor de uma loja de roupas masculinas. Pensa como um vendedor experiente — resolve o problema do cliente, não desiste na primeira falta.

CONVERSA ATÉ AGORA:
${conversa}

O CLIENTE PEDIU: ${clientePediu}

CATÁLOGO DISPONÍVEL NO ESTOQUE (${estoque.total ?? 0} itens):
${estoque.catalogo ?? 'Nenhum produto encontrado.'}

SUA TAREFA:
1. Analise o catálogo e veja se tem exatamente o que o cliente pediu
2. Se TEM: confirme de forma animada e SEMPRE pergunte "posso te mandar uma foto?" — ninguém compra roupa sem ver
3. Se NÃO TEM exatamente: pense como vendedor — o que tem de mais próximo? (mesma peça em outra cor, cor parecida, produto similar?) Seja honesto mas ofereça a alternativa mais próxima com entusiasmo. Ex: "No preto não tenho no P, mas tenho uma polo no azul marinho que fica incrível. Posso te mandar foto?"
4. Se não tem NADA próximo: seja honesto e curto

REGRAS:
- Responda em continuidade natural da conversa, não como script
- Use "${nomeCliente}" no máximo uma vez se ajudar a soar pessoal
- Máx 2-3 linhas — WhatsApp é conversa, não catálogo
- Tom: amigo que entende de moda e quer ajudar, não vendedor robô
- NÃO mencione "reservar" ainda — o próximo passo é a foto

Escreva APENAS a mensagem a enviar, sem explicação:`

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
        tipo:       'sugestao_resposta',
        urgencia:   'alta',
        sugestao,
        contato:    contato?.nome,
        contato_id: contatoId,
        total:      estoque.total ?? 0,
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
