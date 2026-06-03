import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { produtos } = await request.json()
  if (!Array.isArray(produtos) || produtos.length === 0) {
    return NextResponse.json([])
  }

  // Envia no máximo 100 produtos, apenas os campos relevantes para análise
  const amostra = produtos.slice(0, 100).map((p: {
    id: string; nome: string; categoria: string;
    preco_custo: number | null; preco_venda: number | null; marca: string | null
  }) => ({
    id: p.id,
    nome: p.nome,
    categoria: p.categoria,
    preco_custo: p.preco_custo,
    preco_venda: p.preco_venda,
    marca: p.marca,
  }))

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Você é um assistente de gestão de estoque para uma loja de roupas masculinas.
Analise os produtos abaixo e identifique problemas objetivos de dados.

Categorias válidas: "camiseta", "regata", "calca", "tenis", "outros"

Verifique APENAS:
1. Categoria incompatível com o nome (ex: "Regata Nike" como "camiseta" → deveria ser "regata"; "Calça Jeans" como "camiseta" → "calca"; "Tênis Air Max" como "outros" → "tenis")
2. Produto com preco_venda preenchido mas preco_custo null
3. Produto com preco_custo maior ou igual ao preco_venda (margem zero ou negativa)

Regras:
- Não invente problemas. Só inclua quando tiver certeza.
- Se o produto estiver correto, não o inclua na resposta.
- Retorne SOMENTE um JSON array válido, sem markdown. Se não houver problemas, retorne [].

Formato de cada sugestão:
{"produto_id":"...","produto_nome":"...","tipo":"categoria_incorreta|custo_faltando|preco_anomalia","descricao":"frase curta em português","campo":"categoria|preco_custo|null","valor_sugerido":"valor ou null"}

Para "categoria_incorreta": campo="categoria", valor_sugerido=categoria correta (string)
Para "custo_faltando": campo="preco_custo", valor_sugerido=null
Para "preco_anomalia": campo=null, valor_sugerido=null

Produtos:
${JSON.stringify(amostra)}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return NextResponse.json([])

  try {
    const sugestoes = JSON.parse(match[0])
    // Gera ID estável para rastrear sugestões ignoradas no cliente
    const comId = sugestoes.map((s: {
      produto_id: string; tipo: string; campo: string | null;
      produto_nome: string; descricao: string; valor_sugerido: string | null
    }) => ({
      ...s,
      id: `${s.produto_id}:${s.tipo}:${s.campo ?? 'null'}`,
    }))
    return NextResponse.json(comId)
  } catch {
    return NextResponse.json([])
  }
}
