import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ maxRetries: 1 })

/* Traduz o público escrito em português livre pra filtros ESTRUTURADOS --
   nunca gera SQL nem nada livre, só os campos abaixo. O que não conseguir
   mapear volta em `avisos` pro dono conferir, nunca inventado. */
const CAMPOS = `{
  "genero": "M" | "F" | null,
  "nomeComeca": string | null,          // nome do cliente começa com esse prefixo
  "produtoTermo": string | null,        // palavra-chave de produto, categoria OU marca (ex: "polo", "aramis")
  "compradosDesdeDias": number | null,  // comprou (qualquer coisa) nos últimos N dias -- converta "6 meses"->180, "1 ano"->365, "30 dias"->30
  "naoCompradosDesdeDias": number | null, // NÃO comprou nada nos últimos N dias (inativo há pelo menos N dias)
  "gastoMinimo": number | null,         // gastou MAIS que esse valor em reais (total)
  "gastoDesdeAno": boolean,             // true só se a pessoa disse algo como "este ano"/"esse ano" junto do valor gasto
  "qtdComprasMin": number | null,       // número mínimo de compras
  "aniversariantesMes": boolean,        // true se pediu aniversariantes do mês
  "cidadeMencionada": string | null,    // SÓ preencha se a pessoa mencionar uma cidade -- o sistema ainda não tem esse dado
  "avisos": string[]                    // qualquer parte do pedido que você NÃO conseguiu mapear nos campos acima -- nunca invente, descreva o que não entendeu
}`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { texto } = await request.json().catch(() => ({})) as { texto?: string }
  if (!texto || !texto.trim()) return NextResponse.json({ ok: false, erro: 'Escreva pra quem você quer mandar.' }, { status: 400 })

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Você traduz um pedido de público-alvo (escrito em português, por um dono de loja de roupas/calçados) em filtros ESTRUTURADOS pra uma consulta no banco. NUNCA gere SQL ou código -- responda APENAS com um JSON válido, sem texto antes ou depois, exatamente neste formato (omita/null o que não se aplicar): ${CAMPOS}\n\nRegras: só use os campos acima, nenhum outro. Se o pedido mencionar algo que não existe nesses campos (ex: bairro, profissão, cor de roupa específica), coloque uma frase curta em "avisos" explicando o que não deu pra aplicar -- nunca finja que entendeu. "produtoTermo" aceita só UM termo (se o pedido citar produto E marca juntos, escolha o termo mais específico).`,
      messages: [{ role: 'user', content: texto }],
    }, { timeout: 8000 })

    const resposta = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const json = resposta.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return NextResponse.json({ ok: false, erro: 'Não entendi esse público. Tenta descrever de outro jeito.' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bruto = JSON.parse(json) as any
    const avisos: string[] = Array.isArray(bruto.avisos) ? bruto.avisos.filter((a: unknown) => typeof a === 'string') : []
    if (bruto.cidadeMencionada) {
      avisos.push(`Cidade ("${bruto.cidadeMencionada}") ainda não está cadastrada no sistema -- não dá pra filtrar por isso ainda.`)
    }

    const filtro = {
      genero: bruto.genero === 'M' || bruto.genero === 'F' ? bruto.genero : null,
      nomeComeca: typeof bruto.nomeComeca === 'string' && bruto.nomeComeca.trim() ? bruto.nomeComeca.trim() : null,
      produtoTermo: typeof bruto.produtoTermo === 'string' && bruto.produtoTermo.trim() ? bruto.produtoTermo.trim() : null,
      compradosDesdeDias: Number.isFinite(bruto.compradosDesdeDias) ? Number(bruto.compradosDesdeDias) : null,
      naoCompradosDesdeDias: Number.isFinite(bruto.naoCompradosDesdeDias) ? Number(bruto.naoCompradosDesdeDias) : null,
      gastoMinimo: Number.isFinite(bruto.gastoMinimo) ? Number(bruto.gastoMinimo) : null,
      gastoDesdeAno: !!bruto.gastoDesdeAno,
      qtdComprasMin: Number.isFinite(bruto.qtdComprasMin) ? Number(bruto.qtdComprasMin) : null,
      aniversariantesMes: !!bruto.aniversariantesMes,
    }

    return NextResponse.json({ ok: true, filtro, avisos })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao interpretar o público.' }, { status: 502 })
  }
}
