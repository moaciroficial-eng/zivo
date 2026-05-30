'use server'

import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

export type ScanData = {
  nome: string | null
  marca: string | null
  categoria: 'camiseta' | 'calca' | 'tenis' | 'outros' | null
  tamanho: string | null
  preco_venda: number | null
  preco_custo: number | null
}

export async function processarEtiqueta(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const b64       = formData.get('imagem_b64') as string | null
  const mediaType = (formData.get('media_type') as string | null) || 'image/jpeg'

  if (!b64) redirect('/estoque/novo')

  let scanData: ScanData | null = null

  try {
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
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: b64,
              },
            },
            {
              type: 'text',
              text: `Analise esta etiqueta de produto de uma loja de roupas masculinas. Retorne SOMENTE um JSON válido, sem markdown.

Formato exato:
{"nome":"...","marca":null,"categoria":"camiseta","tamanho":null,"preco_venda":null,"preco_custo":null}

Regras:
- "categoria": exatamente "camiseta", "calca", "tenis" ou "outros"
- "tamanho": string (ex: "M", "G", "42") ou null
- preços: número (ex: 89.90) ou null — sem R$
- Se um preço, usar preco_venda
- "nome" em português capitalizado`,
            },
          ],
        },
      ],
    })

    const text  = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) scanData = JSON.parse(match[0])
  } catch {
    // segue sem dados — form abrirá vazio
  }

  if (scanData) {
    const cookieStore = await cookies()
    cookieStore.set('scan_result', JSON.stringify(scanData), {
      maxAge: 120,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })
  }

  redirect('/estoque/novo')
}
