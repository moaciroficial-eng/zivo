import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

const anthropic = new Anthropic()

type CreateEventInput = { nome: string; data: string; descricao?: string }

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages } = await request.json()

  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: clientes },
    { data: vendas },
    { data: estoque },
    { data: eventos },
  ] = await Promise.all([
    supabase.from('clientes').select('nome,telefone,email,tamanho_camiseta,tamanho_calca,tamanho_tenis,data_nascimento,dia_pagamento,observacoes').limit(100),
    supabase.from('vendas').select('cliente_nome,valor,data_venda,produtos').order('data_venda', { ascending: false }).limit(50),
    supabase.from('estoque').select('nome,marca,categoria,tamanhos,preco_custo,preco_venda').limit(100),
    supabase.from('eventos').select('nome,data,descricao').order('data', { ascending: true }).limit(30),
  ])

  const totalReceita = vendas?.reduce((s, v) => s + Number(v.valor), 0) ?? 0

  const system = `Você é o sócio virtual do Moca, dono da loja de roupas masculinas em Barreiras-BA. Sua missão é aprender com os dados da loja todos os dias — vendas, estoque, clientes, datas — e agir como um sócio honesto e experiente.

Hoje é ${today}.

## Regras de comportamento

1. **Seja direto e realista** — se a meta tá difícil, fala; se um produto encalhou, alerta; nunca minta pra agradar.
2. **Aprenda com cada venda registrada** — identifique o que gira rápido, o que encalha, quem compra o quê e em qual época.
3. **Seja proativo** — toda vez que o Moca abrir o chat, analise os dados e traga pelo menos um insight sem ele precisar perguntar. Exemplos: "Moca, identifiquei que camiseta polo vende 3x mais em junho — temos estoque?", "Esse tênis tá há 45 dias parado, considera um desconto".
4. **Foco 100% em varejo de moda masculina** — nada fora disso.
5. **Considere a realidade regional de Barreiras-BA**: festas juninas, clima do sertão, poder aquisitivo local.

## Dados atuais da loja

### Clientes (${clientes?.length ?? 0} cadastrados)
${JSON.stringify(clientes ?? [], null, 2)}

### Vendas recentes — Receita total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceita)} (${vendas?.length ?? 0} registros)
${JSON.stringify(vendas ?? [], null, 2)}

### Estoque (${estoque?.length ?? 0} produtos)
${JSON.stringify(estoque ?? [], null, 2)}

### Calendário (${eventos?.length ?? 0} eventos)
${JSON.stringify(eventos ?? [], null, 2)}

## Instruções adicionais
- Responda sempre em português brasileiro informal, como um sócio falaria
- Use valores monetários no formato BRL (ex: R$ 1.234,56)
- Para criar eventos no calendário, use a ferramenta create_event — infira datas conhecidas sem perguntar ao usuário`

  const tools: Anthropic.Tool[] = [
    {
      name: 'create_event',
      description: 'Cria um novo evento no calendário da loja no Supabase. Use sempre que o usuário pedir para adicionar, criar, marcar ou registrar um evento, data comemorativa, compromisso ou lembrança no calendário.',
      input_schema: {
        type: 'object' as const,
        properties: {
          nome: {
            type: 'string',
            description: 'Nome do evento (ex: "Dia dos Namorados", "Reunião com fornecedor")',
          },
          data: {
            type: 'string',
            description: `Data do evento no formato YYYY-MM-DD. Hoje é ${today}. Infira o ano corretamente com base no contexto.`,
          },
          descricao: {
            type: 'string',
            description: 'Descrição opcional com mais detalhes sobre o evento',
          },
        },
        required: ['nome', 'data'],
      },
    },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // First call — non-streaming so we can detect and execute tool use
      const response1 = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        tools,
        messages,
      })

      const toolUseBlocks = response1.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )

      if (toolUseBlocks.length > 0) {
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === 'create_event') {
            const input = toolUse.input as CreateEventInput
            const { error } = await supabase.from('eventos').insert({
              nome: input.nome,
              data: input.data,
              descricao: input.descricao ?? null,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: error
                ? `Erro ao criar evento: ${error.message}`
                : `Evento "${input.nome}" criado com sucesso para ${input.data}.`,
            })
          }
        }

        // Second call — streaming final response after tool execution
        const followUpMessages: Anthropic.MessageParam[] = [
          ...messages,
          { role: 'assistant', content: response1.content },
          { role: 'user', content: toolResults },
        ]

        const stream2 = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system,
          tools,
          messages: followUpMessages,
        })

        for await (const chunk of stream2) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } else {
        // No tool use — emit the text directly
        for (const block of response1.content) {
          if (block.type === 'text') {
            controller.enqueue(encoder.encode(block.text))
          }
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
