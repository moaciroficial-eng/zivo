'use server'

import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

export type ScanData = {
  nome: string | null
  marca: string | null
  categoria: 'camiseta' | 'regata' | 'calca' | 'polo' | 'tenis' | 'chinelo' | 'outros' | null
  tamanho: string | null
  preco_venda: number | null
  preco_custo: number | null
  codigo_produto: string | null
  cor: string | null
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
      model: 'claude-haiku-4-5-20251001',
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
{"nome":"...","marca":null,"categoria":"camiseta","tamanho":null,"preco_venda":null,"preco_custo":null,"codigo_produto":null,"cor":null}

Regras gerais:
- "categoria": exatamente "camiseta", "regata", "calca", "polo", "tenis", "chinelo" ou "outros"
- "tamanho": string (ex: "M", "G", "42") ou null
- preços: número (ex: 89.90) ou null — sem R$
- Preencha preços SOMENTE se o valor estiver explicitamente impresso na etiqueta; se não encontrar, use null — nunca estime nem infira preços
- "nome" em português capitalizado
- "cor": cor principal do produto exatamente como escrita na etiqueta, sem traduzir (ex: se a etiqueta diz "Black", retorne "Black"; se diz "Preto", retorne "Preto") ou null se não identificada; se o valor for um código interno opaco (ex: "THBDS", "007", "000007", sequências alfanuméricas sem significado de cor), use null

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

    const text  = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) scanData = JSON.parse(match[0])
  } catch {
    // segue sem dados — form abrirá vazio
  }

  // Se a IA identificou a marca e não há preco_custo, busca o markup cadastrado
  if (scanData?.marca && scanData.preco_venda != null && scanData.preco_custo == null) {
    const { data: marca } = await supabase
      .from('marcas')
      .select('markup')
      .eq('user_id', user.id)
      .ilike('nome', scanData.marca)
      .maybeSingle()

    if (marca && marca.markup > 0) {
      scanData.preco_custo = parseFloat((scanData.preco_venda / marca.markup).toFixed(2))
    }
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

export async function clearScanCookie() {
  const cookieStore = await cookies()
  cookieStore.delete('scan_result')
}
