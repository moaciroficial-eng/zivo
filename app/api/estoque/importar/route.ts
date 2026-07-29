import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

/* Importação de PRODUTOS por "cola aí": o dono cola o estoque dele (planilha,
   caderno) e a IA extrai nome, marca, cor, categoria, gênero, a GRADE
   (tamanhos + quantidades) e os preços. Aqui só parseia; grava em /confirmar. */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT = `Você recebe o estoque de uma loja de roupas, colado de qualquer jeito (planilha, caderno digitado). Extraia CADA produto e devolva SOMENTE JSON válido:

{"produtos":[{
  "nome": "nome do produto, limpo (ex: 'Camiseta Gola Careca')",
  "marca": "marca ou null",
  "cor": "cor ou null",
  "categoria": "uma de: camiseta, camisa, polo, calca, bermuda, short, tenis, chinelo, sandalia, bota, jaqueta, moletom, vestido, saia, blusa, acessorio, outro",
  "genero": "M (masculino), F (feminino) ou U (unissex) — infira pela categoria/nome; U se não der pra saber",
  "tamanhos": [{"tamanho":"P/M/G/GG ou 38/40/42 ou nº do pé","qtd":1}],
  "preco_venda": 199.90,
  "preco_custo": 80.00
}]}

Regras da GRADE (tamanhos):
- "M/G/GG" ou "M G GG" → [{"tamanho":"M","qtd":1},{"tamanho":"G","qtd":1},{"tamanho":"GG","qtd":1}]
- "P(2) M(3)" ou "2P 3M" → usa as quantidades: [{"tamanho":"P","qtd":2},{"tamanho":"M","qtd":3}]
- Se não disser quantidade, use qtd 1. Se não disser tamanho, use [{"tamanho":"UN","qtd":1}].
- Calça/bermuda: tamanhos são números (38,40,42). Calçado: número do pé.
- preco_venda e preco_custo: números sem R$ (ou null). NÃO invente preço.
- Ignore cabeçalhos e linhas vazias. Só JSON, sem markdown.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { texto } = await request.json()
  if (!texto || String(texto).trim().length < 3) return NextResponse.json({ ok: false, erro: 'Cole a lista de produtos.' }, { status: 400 })

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: PROMPT,
      messages: [{ role: 'user', content: String(texto).slice(0, 20000) }],
    })
    const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return NextResponse.json({ ok: false, erro: 'Não consegui ler a lista.' }, { status: 422 })
    const parsed = JSON.parse(m[0])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const produtos = (Array.isArray(parsed.produtos) ? parsed.produtos : []).filter((p: any) => p?.nome?.trim())
    return NextResponse.json({ ok: true, produtos })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro ao processar.' }, { status: 500 })
  }
}
