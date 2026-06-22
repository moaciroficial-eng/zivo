import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_APRENDIZADO = `Você é o Zivo, o cérebro estratégico de uma loja de roupas.
Sua função agora é APRENDER com o dono da loja.

Quando o dono compartilha uma experiência, estratégia ou observação:
1. Demonstre que entendeu com 1 frase
2. Faça UMA pergunta inteligente pra aprofundar (o porquê funcionou, o perfil de quem reagiu, o timing, etc.)
3. Seja curioso como um sócio que quer entender o negócio a fundo

Exemplos de boas perguntas:
- "Que tipo de cliente respondeu melhor a essa campanha?"
- "Qual foi o gatilho que mais funcionou — o preço, o produto ou a forma de abordar?"
- "Em que horário/dia você fez isso? Influenciou o resultado?"
- "O que você faria diferente na próxima vez?"

Quando sentir que o tema está esgotado, resuma o que aprendeu em 2-3 pontos e pergunte se quer salvar ou continuar falando.

Tom: parceiro de negócios inteligente, curioso, direto. Não bajule — questione e aprenda.`

/* POST — conversa de aprendizado */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { mensagem, historico = [] } = await request.json()
  if (!mensagem) return NextResponse.json({ ok: false })

  const messages = [
    ...historico.map((h: { papel: string; conteudo: string }) => ({
      role: h.papel === 'dono' ? 'user' as const : 'assistant' as const,
      content: h.conteudo,
    })),
    { role: 'user' as const, content: mensagem },
  ]

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_APRENDIZADO,
    messages,
  })

  const resposta = (res.content[0] as { text: string }).text.trim()

  return NextResponse.json({ ok: true, resposta })
}

/* PUT — finaliza sessão e salva os insights */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { historico = [] } = await request.json()
  if (!historico.length) return NextResponse.json({ ok: false, error: 'Sem histórico' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Usa IA pra extrair insights estruturados da conversa */
  const transcricao = historico
    .map((h: { papel: string; conteudo: string }) =>
      `[${h.papel === 'dono' ? 'DONO' : 'ZIVO'}] ${h.conteudo}`)
    .join('\n')

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Você é o Zivo. Leia essa conversa de aprendizado e extraia os insights mais valiosos para guardar na base de conhecimento da loja.

CONVERSA:
${transcricao}

Retorne um JSON com array de insights:
{
  "insights": [
    {
      "categoria": "vendas | clientes | produtos | mercado | regras | campanhas",
      "titulo": "título curto e descritivo (max 8 palavras)",
      "conteudo": "o aprendizado em 1-3 frases claras e acionáveis"
    }
  ],
  "resumo": "1 parágrafo resumindo o que o dono compartilhou e o principal aprendizado"
}

Extraia APENAS insights realmente úteis e acionáveis. Qualidade > quantidade. Máx 8 insights.`,
    }],
  })

  const raw = (res.content[0] as { text: string }).text.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ ok: false, error: 'IA não retornou JSON' })

  const parsed = JSON.parse(match[0])
  const insights = parsed.insights as Array<{ categoria: string; titulo: string; conteudo: string }>

  if (!insights?.length) return NextResponse.json({ ok: true, salvos: 0, resumo: parsed.resumo })

  await admin.from('conhecimento').insert(
    insights.map(i => ({
      user_id:   user.id,
      categoria: i.categoria,
      titulo:    i.titulo,
      conteudo:  i.conteudo,
      fonte:     'sessao_aprendizado',
      ativo:     true,
    }))
  )

  return NextResponse.json({ ok: true, salvos: insights.length, resumo: parsed.resumo, insights })
}
