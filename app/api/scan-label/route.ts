import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

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
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { image, mediaType } = await request.json()

  if (!image) return NextResponse.json({ error: 'Imagem não fornecida' }, { status: 400 })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image,
            },
          },
          {
            type: 'text',
            text: `Analise esta imagem de etiqueta de produto de uma loja de roupas masculinas. Extraia as informações e retorne SOMENTE um JSON válido, sem markdown, sem explicação extra.

Formato exato:
{"nome":"...","marca":null,"categoria":"camiseta","tamanho":null,"preco_venda":null,"preco_custo":null,"codigo_produto":null}

Regras gerais:
- "categoria" deve ser exatamente: "camiseta", "calca", "tenis" ou "outros"
- "tamanho": string com o tamanho identificado (ex: "M", "G", "42") ou null
- "preco_venda" e "preco_custo": número (ex: 89.90) ou null — sem R$
- Se houver só um preço, use preco_venda
- "nome" em português, capitalizado (ex: "Camiseta Básica", "Calça Jeans Slim")
- Se não encontrar algo, use null

Regras para "codigo_produto" (código de referência / SKU):
- Procure por prefixos como "REF:", "REF.:", "REF ", "Ref.", "COD:", "COD.", "SKU:", "Art.", "ART.", "Cód.", "Código:"
- Também pode aparecer como código alfanumérico isolado próximo ao topo ou ao código de barras (ex: "ABC-1234", "12345-01", "TN-042-P")
- Ignore sequências numéricas longas (8+ dígitos) que são código de barras EAN/UPC
- Retorne apenas o valor, sem o prefixo — ex: "123456" e não "REF: 123456"
- Se houver ambiguidade entre dois possíveis códigos, prefira o mais curto e alfanumérico`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Não foi possível extrair dados da imagem. Tente uma foto mais nítida.' }, { status: 422 })
  }

  try {
    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Resposta inválida da IA. Tente novamente.' }, { status: 422 })
  }
}
