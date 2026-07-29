import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

/* Importação de clientes por "cola aí": o dono cola a lista dele (de qualquer
   jeito — Excel, caderno digitado, contatos) e a IA extrai os campos. Depois
   ele revisa e confirma. Aqui só PARSEIA — quem grava é /confirmar. */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT = `Você recebe uma lista de clientes de uma loja de roupas, colada de qualquer jeito (planilha, caderno digitado, contatos do celular). Extraia CADA cliente e devolva SOMENTE JSON válido:

{"clientes":[{
  "nome": "nome completo (limpo, capitalizado)",
  "telefone": "só dígitos, com DDD se houver (ex: 77999512004) ou null",
  "genero": "M ou F — infira pelo primeiro nome brasileiro quando não estiver explícito; null só se for nome ambíguo/unissex",
  "tamanho_camiseta": "P/M/G/GG/etc ou null",
  "tamanho_calca": "numeração (38/40/42...) ou null",
  "tamanho_tenis": "número do pé ou null",
  "data_nascimento": "YYYY-MM-DD se houver data (converta DD/MM/AAAA); null se não houver"
}]}

Regras:
- Uma linha pode ter vários campos misturados (ex: "João Silva 77 99999-8888 M cam G calça 40"). Separe certo.
- NÃO invente telefone nem tamanho — se não está no texto, use null (exceto gênero, que você PODE inferir pelo nome).
- Ignore cabeçalhos de planilha e linhas vazias.
- Capitalize os nomes (joão silva → João Silva).
- Só JSON, sem markdown.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { texto } = await request.json()
  if (!texto || String(texto).trim().length < 3) return NextResponse.json({ ok: false, erro: 'Cole a lista de clientes.' }, { status: 400 })

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: PROMPT,
      messages: [{ role: 'user', content: String(texto).slice(0, 20000) }],
    })
    const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return NextResponse.json({ ok: false, erro: 'Não consegui ler a lista. Tenta colar de outro jeito.' }, { status: 422 })
    const parsed = JSON.parse(m[0])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientes = (Array.isArray(parsed.clientes) ? parsed.clientes : []).filter((c: any) => c?.nome?.trim())
    return NextResponse.json({ ok: true, clientes })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro ao processar.' }, { status: 500 })
  }
}
