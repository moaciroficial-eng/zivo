import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { casarClientesPorTamanho } from '@/lib/inteligencia/campanhas'

/* ══════════════════════════════════════════════════════════════
   CONSULTORA DE CAMPANHAS — especialista em ofertas que ENTREVISTA

   O dono conversa; a consultora faz as perguntas certas (objetivo,
   produto, tamanhos a vender, preço/desconto, diferencial), busca
   produto no estoque e casa clientes por tamanho — e quando tem tudo,
   monta a PROPOSTA (copy humana + público casado). O envio é só depois
   que o dono aprova (outra rota).
   ══════════════════════════════════════════════════════════════ */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/* eslint-disable @typescript-eslint/no-explicit-any */
const TOOLS = [
  {
    name: 'buscar_produtos',
    description: 'Busca produtos no estoque (por termo, marca ou categoria) pra saber o que tem pra oferecer: nome, marca, cor, tamanhos disponíveis e preço.',
    input_schema: {
      type: 'object' as const,
      properties: {
        termo: { type: 'string', description: 'parte do nome do produto' },
        marca: { type: 'string' },
        categoria: { type: 'string' },
      },
    },
  },
  {
    name: 'casar_clientes',
    description: 'Dado os tamanhos que o dono QUER vender (ex: ["G","GG"]) e opcionalmente a marca, retorna QUANTOS e QUAIS clientes vestem esses tamanhos (nunca sugere quem usa tamanho fora da lista). Quem tem afinidade com a marca vem primeiro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tamanhos: { type: 'array', items: { type: 'string' }, description: 'tamanhos a vender' },
        marca: { type: 'string', description: 'marca da oferta (opcional)' },
      },
      required: ['tamanhos'],
    },
  },
]

async function execTool(admin: any, userId: string, nome: string, input: any): Promise<unknown> {
  try {
    if (nome === 'buscar_produtos') {
      let q = admin.from('estoque').select('nome, marca, categoria, cor, tamanhos, preco_venda').eq('user_id', userId)
      if (input.marca) q = q.ilike('marca', `%${input.marca}%`)
      if (input.categoria) q = q.ilike('categoria', `%${input.categoria}%`)
      if (input.termo) q = q.ilike('nome', `%${input.termo}%`)
      const { data } = await q.limit(40)
      const itens = (data ?? []).map((i: any) => ({
        nome: i.nome, marca: i.marca, cor: i.cor, preco: i.preco_venda,
        tamanhos_disponiveis: (Array.isArray(i.tamanhos) ? i.tamanhos : []).filter((t: any) => (Number(t.qtd) || 0) > 0).map((t: any) => `${t.tamanho}(${t.qtd})`),
      })).filter((i: any) => i.tamanhos_disponiveis.length > 0)
      return { total: itens.length, itens: itens.slice(0, 25) }
    }
    if (nome === 'casar_clientes') {
      const casados = await casarClientesPorTamanho(admin, userId, input.tamanhos ?? [], input.marca ?? null)
      return {
        total: casados.length,
        com_afinidade_marca: casados.filter(c => c.afinidadeMarca).length,
        amostra: casados.slice(0, 12).map(c => ({ nome: c.nome, motivo: c.motivo })),
      }
    }
    return { erro: `ferramenta desconhecida: ${nome}` }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha na consulta' }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { mensagem, historico = [] } = await request.json()
  if (!mensagem) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: config } = await admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()
  const nomeLoja = config?.nome_loja || 'a loja'

  const systemPrompt = `Você é a Consultora de Campanhas do Zivo — especialista SÊNIOR em marketing e vendas de moda, trabalhando pra ${nomeLoja}. O dono conversa com você pra montar uma campanha/oferta que VENDE.

Seu jeito: você CONDUZ. O dono não sabe de marketing — você tira a resposta dele com as perguntas certas, UMA de cada vez, curtas e claras. Nada de formulário nem textão.

Descubra o essencial pra montar uma oferta forte:
- Qual o OBJETIVO? (zerar a grade de um produto que chegou, girar estoque parado, aproveitar uma data como Dia dos Pais, reativar cliente)
- Qual PRODUTO (ou ocasião)? Use buscar_produtos pra ver o que tem no estoque.
- Quais TAMANHOS vender? (importante: só vamos oferecer pra quem veste esses tamanhos)
- PREÇO cheio ou com DESCONTO? Se desconto, quanto?
- O que essa peça tem de ESPECIAL pra destacar?
- Tem FOTO boa? (sem foto a oferta rende menos — sugira tirar uma)

Use casar_clientes assim que souber os tamanhos (e marca) pra dizer ao dono QUANTOS clientes casam — isso empolga e valida.

Quando tiver o suficiente, MONTE a proposta. Responda SEMPRE em JSON:
{
  "resposta": "o que você fala pro dono agora (pergunta seguinte OU apresentação da proposta)",
  "proposta": null
}
Enquanto estiver entrevistando, "proposta": null. Quando fechar, preencha:
{
  "resposta": "apresentando a campanha e pedindo pra revisar/aprovar",
  "proposta": {
    "titulo": "nome curto da campanha",
    "objetivo": "zerar_grade | girar_estoque | data | reativar",
    "tamanhos": ["G","GG"],
    "marca": "Aramis ou null",
    "copy_descritor": "texto curto pro cliente (ex: 'da Aramis', 'de camisa social', 'pro Dia dos Pais') — vai no meio de uma frase natural",
    "copy_texto": "a mensagem HUMANA e calorosa pra cliente QUENTE (que respondeu nas últimas 24h). Use {nome} pro primeiro nome. Natural, brasileira, com um convite ('quer que eu te mande as fotos?'). NUNCA robótica.",
    "produtos_destaque": ["nomes dos produtos"],
    "desconto": "ex: '20%' ou null"
  }
}
A copy tem que soar como GENTE conversando, não anúncio. Ex: "Oi {nome}, tudo bem? 😊 Chegaram peças novas da Aramis que são muito o seu estilo, quer que eu te mande as fotos?"`

  const messages: any[] = [
    ...historico.map((h: { papel: string; conteudo: string }) => ({
      role: h.papel === 'dono' ? 'user' as const : 'assistant' as const,
      content: h.conteudo,
    })),
    { role: 'user' as const, content: mensagem },
  ]

  /* Loop de tool-use */
  let res: any
  let guard = 0
  while (true) {
    res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })
    if (res.stop_reason !== 'tool_use' || guard++ >= 4) break
    messages.push({ role: 'assistant', content: res.content })
    const toolResults: any[] = []
    for (const block of res.content) {
      if (block.type === 'tool_use') {
        const r = await execTool(admin, user.id, block.name, block.input)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(r) })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  const text = (res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')).trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: any = { resposta: text, proposta: null }
  try { if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) } catch { /* mantém texto cru */ }

  /* Se fechou a proposta, resolve o público REAL (código, não modelo) */
  let publico: { id: string; nome: string; telefone: string | null; motivo: string }[] = []
  if (parsed.proposta?.tamanhos?.length) {
    const casados = await casarClientesPorTamanho(admin, user.id, parsed.proposta.tamanhos, parsed.proposta.marca ?? null)
    publico = casados.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, motivo: c.motivo }))
  }

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta ?? '',
    proposta: parsed.proposta ?? null,
    publico,
  })
}
