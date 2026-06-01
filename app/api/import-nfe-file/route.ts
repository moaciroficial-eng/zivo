import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

const PROMPT = `Analise este documento de Nota Fiscal Eletrônica (NF-e) brasileira.
Extraia TODOS os produtos/itens da nota e retorne SOMENTE JSON válido, sem markdown, sem explicação:

{
  "emitente": "nome fantasia do emitente (xFant) ou nome razão social (xNome), ou null",
  "num_nfe": "número da NF-e (campo nNF) ou null",
  "items": [
    {
      "nome": "descrição completa do produto (xProd)",
      "codigo_produto": "código/referência do produto (cProd) ou null",
      "ncm": "NCM com 8 dígitos ou null",
      "cfop": "CFOP com 4 dígitos ou null",
      "cest": "código CEST ou null",
      "icms": "alíquota ICMS como texto, ex: 'CST 00 / 12%' ou null",
      "pis": "alíquota PIS como texto, ex: 'CST 01 / 0.65%' ou null",
      "cofins": "alíquota COFINS como texto ou null",
      "qtd": 10,
      "preco_custo": 45.90
    }
  ]
}

Regras:
- Inclua TODOS os itens/linhas de produtos, sem omitir nenhum
- "qtd" deve ser número inteiro (arredonde se necessário)
- "preco_custo" é o valor unitário do item, sem R$ (número decimal ou null se ilegível)
- Se uma informação não estiver visível ou legível, use null
- Não inclua nenhum texto fora do JSON`

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { file, mediaType } = await request.json() as { file: string; mediaType: string }
  if (!file || !mediaType) {
    return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 })
  }

  const isPdf = mediaType === 'application/pdf'

  const contentBlock = isPdf
    ? ({
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: file },
      })
    : ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
          data: file,
        },
      })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text', text: PROMPT }],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Não foi possível extrair dados do documento.' }, { status: 422 })
    }

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Erro ao processar documento: ${msg}` }, { status: 500 })
  }
}
