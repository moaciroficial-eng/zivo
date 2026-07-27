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
    description: 'Dado os tamanhos que o dono QUER vender (ex: ["G","GG"]), opcionalmente a marca e o gênero do produto, retorna QUANTOS e QUAIS clientes vestem esses tamanhos (nunca sugere quem usa tamanho fora da lista, nem quem é do gênero oposto ao produto). Quem tem afinidade com a marca vem primeiro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tamanhos: { type: 'array', items: { type: 'string' }, description: 'tamanhos a vender' },
        marca: { type: 'string', description: 'marca da oferta (opcional)' },
        genero: { type: 'string', description: "gênero do produto: 'M' (masculino), 'F' (feminino) ou vazio se unissex" },
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
      const casados = await casarClientesPorTamanho(admin, userId, input.tamanhos ?? [], input.marca ?? null, input.genero ?? null)
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

  const { mensagem, historico = [], foto = null, intensidade = 'leve' } = await request.json()
  if (!mensagem && !foto) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: config } = await admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()
  const nomeLoja = config?.nome_loja || 'a loja'

  const systemPrompt = `Você é a Consultora de Campanhas do Zivo — especialista SÊNIOR em marketing e vendas de moda, trabalhando pra ${nomeLoja}. O dono conversa com você pra montar uma campanha/oferta que VENDE.

Seu jeito: você CONDUZ. O dono não sabe de marketing — você tira a resposta dele com as perguntas certas, UMA de cada vez, curtas e claras. Nada de formulário nem textão.

Descubra o essencial pra montar uma oferta forte:
- Qual o OBJETIVO? (zerar a grade de um produto que chegou, girar estoque parado, aproveitar uma data como Dia dos Pais, reativar cliente)
- Qual PRODUTO (ou ocasião)? IMPORTANTE: quando precisar do produto, NUNCA peça pro dono digitar o nome — mande ele tocar no botão 📦 ("Escolher produto do estoque") pra selecionar o produto (pode ser MAIS DE UM), com os tamanhos e preço reais. Quando o dono selecionar, a mensagem já vem com nome, marca, gênero, tamanhos em estoque e preço — trabalhe em cima disso. Use buscar_produtos só se precisar conferir/comparar outros itens.
- Quais TAMANHOS vender? (importante: só vamos oferecer pra quem veste esses tamanhos — normalmente "zerar a grade" = um de cada tamanho que tem em estoque)
- PREÇO cheio ou com DESCONTO? Se desconto, quanto?
- O que essa peça tem de ESPECIAL pra destacar?

GÊNERO: se o produto é masculino ('M') ou feminino ('F'), a oferta NÃO vai pra quem é do gênero oposto — sempre passe o gênero pro casar_clientes. Se o dono selecionou vários produtos e todos são do mesmo gênero, use esse gênero.

FOTO: se o dono ANEXOU uma foto do produto (você vai ver a imagem), comente rápido se ela vende bem (luz, enquadramento, se dá pra ver a peça) e USE o que vê pra deixar a copy mais concreta. A foto será enviada junto na oferta.

TOM DA OFERTA (o dono escolhe "${intensidade === 'agressiva' ? 'AGRESSIVA' : 'DE BOA'}"):
- DE BOA (leve): convite suave, sem pressão. Ex: "Oi {nome}, tudo bem? 😊 Chegaram novidades da Aramis muito com a sua cara, quer que eu te mande as fotos?"
- AGRESSIVA: direta, com a peça específica + gancho de urgência + PREÇO ESPECIAL/condição pra fechar hoje, já contando que a foto vai junto. Ex: "Bom dia {nome}, tudo bem? Chegou um embarque novo da Aramis e essa camiseta aqui eu achei muito a sua cara — se tiver interesse, faço um preço especial pra você hoje 😉". Nunca invente desconto que o dono não autorizou; se ele não deu preço especial, pergunte antes de prometer.
Agora monte a copy no tom "${intensidade}".

Use casar_clientes assim que souber os tamanhos (marca e gênero) pra dizer ao dono QUANTOS clientes casam — isso empolga e valida.

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
    "genero": "M | F | null (null = unissex)",
    "intensidade": "${intensidade}",
    "copy_descritor": "texto curto pro cliente (ex: 'da Aramis', 'de camisa social', 'pro Dia dos Pais') — vai no meio de uma frase natural",
    "copy_texto": "a mensagem pra cliente QUENTE no tom escolhido. Use {nome} pro primeiro nome. Natural, brasileira. NUNCA robótica.",
    "produtos_destaque": ["nomes dos produtos"],
    "desconto": "ex: '20%' ou null"
  }
}
A copy tem que soar como GENTE conversando, não anúncio.`

  const conteudoAtual: any = foto
    ? [
        { type: 'image', source: { type: 'url', url: foto } },
        { type: 'text', text: mensagem || 'Essa é a foto do produto pra campanha. O que achou?' },
      ]
    : mensagem

  const messages: any[] = [
    ...historico.map((h: { papel: string; conteudo: string }) => ({
      role: h.papel === 'dono' ? 'user' as const : 'assistant' as const,
      content: h.conteudo,
    })),
    { role: 'user' as const, content: conteudoAtual },
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
    const casados = await casarClientesPorTamanho(admin, user.id, parsed.proposta.tamanhos, parsed.proposta.marca ?? null, parsed.proposta.genero ?? null)
    publico = casados.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, motivo: c.motivo }))
  }

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta ?? '',
    proposta: parsed.proposta ?? null,
    publico,
  })
}
