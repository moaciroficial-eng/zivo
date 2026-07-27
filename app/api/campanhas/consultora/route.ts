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

  const { mensagem, historico = [], foto = null } = await request.json()
  if (!mensagem && !foto) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: config } = await admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()
  const nomeLoja = config?.nome_loja || 'a loja'

  const systemPrompt = `Você é a Consultora de Campanhas do Zivo — especialista SÊNIOR em marketing e vendas de moda, trabalhando pra ${nomeLoja}. O dono conversa com você pra montar uma campanha/oferta que VENDE.

Seu jeito: você CONDUZ. O dono não sabe de marketing — você tira a resposta dele com as perguntas certas, UMA de cada vez, curtas e claras. Nada de formulário nem textão.

JEITO DE PERGUNTAR — MENOS TEXTO, MAIS BOTÃO: o dono é do balcão, não gosta de digitar. Sempre que a pergunta tiver respostas previsíveis, ofereça BOTÕES (espera "opcoes" ou os passos especiais "produto"/"desconto"/"foto"). O ÚNICO passo em que ele escreve é a descrição/diferencial do produto (passo 5). Perguntas curtas, uma de cada vez.

O ROTEIRO da entrevista (nessa ordem lógica):
1. OBJETIVO — espera "opcoes", opcoes: ["Zerar a grade de um produto","Girar estoque parado","Aproveitar uma data","Reativar clientes"].
2. PRODUTO — mande o dono ESCOLHER no estoque (espera "produto"). NUNCA peça pra digitar o nome. Ele seleciona (pode ser MAIS DE UM) e a mensagem já vem com nome, marca, gênero, tamanhos e preço reais. Use buscar_produtos só pra conferir/comparar.
3. TAMANHOS — normalmente já vêm da seleção do produto. Se precisar confirmar quais vender, use opcoes com os tamanhos disponíveis.
4. PREÇO — espera "desconto" (o app mostra "Preço cheio" e um campo pra % ou R$). Não peça em texto.
5. DIFERENCIAL — o que a peça tem de ESPECIAL (tecido, caimento, cor, novidade). ESTE é o passo de escrever: espera "texto".
6. TOM — espera "opcoes", opcoes: ["😌 Suave","🔥 Agressiva"].
7. FOTO — ANTES de gerar a copy, espera "foto" (o app mostra "Subir foto"/"Seguir sem foto"). Só passe pra copy DEPOIS que ele subir a foto OU disser pra seguir sem foto.
8. Aí sim GERE a proposta (com a copy).

REGRA DE OURO (nome do produto): o estoque tem códigos internos feios (ex: "CAMISETA MC LISTRAS BASICA (MO) OFF WHITE C/ CASTOR P"). NUNCA mostre esse código cru — nem pro cliente na copy, nem pro dono na "resposta". Descreva humano: "camiseta de listras off white". produtos_destaque é interno, mas mesmo nele use descrição limpa.

GÊNERO: produto 'M' ou 'F' → a oferta NÃO vai pro gênero oposto. Sempre passe o gênero pro casar_clientes.

FOTO (visão): se o dono ANEXOU uma foto (você vê a imagem), comente rápido se ela vende bem (luz, enquadramento) e use o que vê pra deixar a copy concreta. A foto vai junto na oferta.

TOM:
- SUAVE: convite leve, sem pressão. Ex: "Oi {nome}, tudo bem? 😊 Chegou uma novidade da Aramis muito com a sua cara, quer que eu te mande as fotos?"
- AGRESSIVA: direta, peça específica + gancho de urgência + PREÇO ESPECIAL pra fechar hoje. Ex: "Bom dia {nome}, tudo bem? Chegou um embarque novo da Aramis e essa camiseta eu achei muito a sua cara — se tiver interesse, faço um preço especial pra você hoje 😉". Nunca invente desconto não autorizado.

Use casar_clientes assim que souber tamanhos (marca e gênero) pra dizer QUANTOS clientes casam — isso valida.

Você responde SEMPRE em JSON puro (sem markdown, sem \`\`\`), com estes campos:
{
  "resposta": "o que você fala pro dono agora — humana, curta, SEM código de produto e SEM JSON dentro",
  "espera": "texto | produto | foto | opcoes | desconto",  // o que o app deve mostrar pro dono responder AGORA
  "opcoes": ["opção 1","opção 2"],   // só quando espera = "opcoes"
  "proposta": null
}
- espera "produto" = app mostra o botão de escolher produto do estoque.
- espera "desconto" = app mostra "Preço cheio" + campo de % ou R$.
- espera "foto" = app mostra "Subir foto" / "Seguir sem foto".
- espera "opcoes" = app mostra os botões de opcoes.
- espera "texto" = app mostra o campo de escrever (use só no passo do diferencial).
Enquanto entrevista, "proposta": null. Quando fechar (JÁ com tom escolhido E a etapa da foto resolvida), preencha:
{
  "resposta": "apresentando a campanha e pedindo pra revisar/aprovar",
  "espera": "texto",
  "opcoes": [],
  "proposta": {
    "titulo": "nome curto e humano da campanha (sem código)",
    "objetivo": "zerar_grade | girar_estoque | data | reativar",
    "tamanhos": ["G","GG"],
    "marca": "Aramis ou null",
    "genero": "M | F | null (null = unissex)",
    "intensidade": "leve | agressiva (o tom que o dono escolheu)",
    "copy_descritor": "descrição humana curta pro cliente (ex: 'da Aramis', 'de camisa social') — SEM código",
    "copy_texto": "a mensagem pra cliente QUENTE no tom escolhido. Use {nome} pro primeiro nome. Natural, brasileira. NUNCA robótica, NUNCA com código de produto.",
    "produtos_destaque": ["descrição limpa dos produtos"],
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

  /* Rede de segurança: a resposta pro dono nunca deve conter JSON/código cru */
  if (typeof parsed.resposta === 'string') {
    parsed.resposta = parsed.resposta.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*\}/g, '').trim()
    if (!parsed.resposta) parsed.resposta = parsed.proposta ? 'Prontinho, montei a campanha aqui embaixo — dá uma olhada 👇' : 'Me conta um pouco mais pra eu montar a melhor oferta.'
  }
  const opcoes: string[] = Array.isArray(parsed.opcoes) ? parsed.opcoes.filter((o: unknown) => typeof o === 'string' && o.trim()).slice(0, 4) : []
  const espera: string = ['texto', 'produto', 'foto', 'opcoes', 'desconto'].includes(parsed.espera) ? parsed.espera
    : opcoes.length > 0 ? 'opcoes' : 'texto'

  /* Se fechou a proposta, resolve o público REAL (código, não modelo) */
  let publico: { id: string; nome: string; telefone: string | null; motivo: string }[] = []
  if (parsed.proposta?.tamanhos?.length) {
    const casados = await casarClientesPorTamanho(admin, user.id, parsed.proposta.tamanhos, parsed.proposta.marca ?? null, parsed.proposta.genero ?? null)
    publico = casados.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, motivo: c.motivo }))
  }

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta ?? '',
    espera,
    opcoes,
    proposta: parsed.proposta ?? null,
    publico,
  })
}
