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

  const { grupoId, image, mediaType } = await request.json() as {
    grupoId: string
    image: string
    mediaType: string
  }

  if (!grupoId || !image) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  // Busca produtos do grupo no banco
  const { data: produtos, error } = await supabase
    .from('estoque')
    .select('id, nome, codigo_produto, marca, preco_venda, ncm')
    .eq('nfe_grupo_id', grupoId)
    .eq('user_id', user.id)

  if (error || !produtos?.length) {
    return NextResponse.json({ error: 'Grupo de NF-e não encontrado' }, { status: 404 })
  }

  const produtosParaIA = produtos.map(p => ({
    id: p.id,
    nome: p.nome,
    codigo_produto: p.codigo_produto,
    ncm: p.ncm,
    preco_venda: p.preco_venda,
  }))

  const prompt = `Você está auxiliando na conferência de recebimento de mercadoria de uma loja de roupas masculinas.

PRODUTOS ESPERADOS NESTA NOTA FISCAL:
${JSON.stringify(produtosParaIA, null, 2)}

Analise a etiqueta na imagem e compare com os produtos acima.
Retorne SOMENTE JSON válido, sem markdown, sem explicação:

{
  "etiqueta": {
    "nome": "nome identificado na etiqueta ou null",
    "marca": "marca ou null",
    "tamanho": "tamanho (P/M/G/42/etc) ou null",
    "cor": "cor ou null",
    "preco_venda": 89.90,
    "codigo_produto": "código ou null"
  },
  "match_produto_id": "EXATAMENTE um dos ids da lista acima, ou null se não encontrar correspondência",
  "confianca": "alta|media|baixa|nenhuma",
  "divergencias": ["Cor diferente: etiqueta=Azul, nota=Verde"],
  "ok": true
}

Regras de comparação:
- "match_produto_id" deve ser EXATAMENTE um dos ids listados, ou null
- Use código do produto (cProd/SKU) quando disponível na etiqueta — é o critério mais confiável
- Considere divergências de nome, tamanho, cor, código — NÃO mencione diferença de preço nas divergências
- "ok" = true se produto bate com a nota sem divergências críticas (pequenas variações tipográficas são ok)
- "confianca": alta = correspondência clara, media = provável, baixa = incerto, nenhuma = sem match`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: image,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Não foi possível analisar a etiqueta.' }, { status: 422 })
    }

    const result = JSON.parse(jsonMatch[0])

    // Valida que match_produto_id é realmente um dos produtos do grupo
    if (result.match_produto_id && !produtos.find(p => p.id === result.match_produto_id)) {
      result.match_produto_id = null
      result.confianca = 'nenhuma'
    }

    // Inclui preco_venda esperado do produto matched para comparação no cliente
    if (result.match_produto_id) {
      const matched = produtos.find(p => p.id === result.match_produto_id)
      result.preco_venda_esperado = matched?.preco_venda ?? null
    } else {
      result.preco_venda_esperado = null
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Erro ao analisar etiqueta: ${msg}` }, { status: 500 })
  }
}
