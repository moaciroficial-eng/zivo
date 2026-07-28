import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { casarClientesPorTamanho, resolverPublico } from '@/lib/inteligencia/campanhas'
import { proximasDatas } from '@/lib/datas-comemorativas'

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

async function execTool(admin: any, userId: string, nome: string, input: any, generoProduto: string | null): Promise<unknown> {
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
      /* gênero do produto (do picker) manda; só cai no do modelo se não veio */
      const casados = await casarClientesPorTamanho(admin, userId, input.tamanhos ?? [], input.marca ?? null, generoProduto ?? input.genero ?? null)
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

  const { mensagem, historico = [], foto = null, genero_produto = null, tem_foto = false } = await request.json()
  if (!mensagem && !foto) return NextResponse.json({ ok: false }, { status: 400 })
  const temFoto = !!tem_foto || !!foto

  /* Gênero AUTORITATIVO do produto selecionado (vem do picker). Não dependemos
     do modelo lembrar de setar — é o servidor que garante o filtro. */
  const gProd = String(genero_produto ?? '').trim().toUpperCase().charAt(0)
  const generoProduto: string | null = gProd === 'M' || gProd === 'F' ? gProd : null

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: config } = await admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()
  const nomeLoja = config?.nome_loja || 'a loja'

  /* Datas comemorativas REAIS (feriados móveis calculados) — a consultora
     usa a data certa e agenda os posts a partir dela. */
  const hojeD = new Date()
  const hojeStr = hojeD.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const datasCtx = proximasDatas(150, hojeD)
    .map(d => `${d.nome}: ${d.data}/${d.ano} (em ${d.dias} dias)`)
    .join(' | ') || '(nenhuma nos próximos 150 dias)'

  const systemPrompt = `Você é a Consultora de Campanhas do Zivo — especialista SÊNIOR em marketing e vendas de moda, trabalhando pra ${nomeLoja}. O dono conversa com você pra montar uma campanha/oferta que VENDE.

HOJE É ${hojeStr}. DATAS COMEMORATIVAS REAIS (use SEMPRE estas, nunca invente data): ${datasCtx}. Ao montar o calendário de posts, calcule as datas a partir da data real do evento (ex: "3 dias antes" = conte a partir da data acima).

Seu jeito: você CONDUZ. O dono não sabe de marketing — você tira a resposta dele com as perguntas certas, UMA de cada vez, curtas e claras. Nada de formulário nem textão.

JEITO DE PERGUNTAR — MENOS TEXTO, MAIS BOTÃO: o dono é do balcão, não gosta de digitar. Sempre que a pergunta tiver respostas previsíveis, ofereça BOTÕES (espera "opcoes" ou os passos especiais "produto"/"desconto"/"foto"). Perguntas curtas, uma de cada vez.

━━━ DOIS TIPOS DE CAMPANHA — descubra qual é logo no começo ━━━
(A) CAMPANHA DE PRODUTO — "chegou um produto e quero vender / zerar a grade". Gira em torno de produto(s) que o dono seleciona no estoque, e a gente casa os clientes por TAMANHO. Saída = "proposta" (copy + público casado por tamanho). Siga o ROTEIRO DE PRODUTO.
(B) CAMPANHA DE DATA / GERAL — data comemorativa (Dia dos Pais, Dia das Mães, Black Friday, Natal, aniversário da loja) ou campanha ampla da loja. NÃO é sobre um produto nem tamanho — é ESTRATÉGIA. Aqui você é ESTRATEGISTA DE MARKETING e entrega um "plano" (estratégia + copy de divulgação no WhatsApp + roteiro de posts pro Instagram). Siga o ROTEIRO DE DATA/GERAL.
Como saber: se o dono selecionar produto no estoque → PRODUTO. Se ele falar de uma DATA ou "campanha da loja/geral" → DATA/GERAL. Na dúvida, primeira pergunta com opcoes ["Vender um produto específico","Campanha da loja / data comemorativa"].

━━━ ROTEIRO DE PRODUTO (nessa ordem lógica) ━━━
1. OBJETIVO — espera "opcoes", opcoes: ["Zerar a grade de um produto","Girar estoque parado","Aproveitar uma data","Reativar clientes"].
2. PRODUTO — mande o dono ESCOLHER no estoque (espera "produto"). NUNCA peça pra digitar o nome. Ele seleciona (pode ser MAIS DE UM) e a mensagem já vem com nome, marca, gênero, tamanhos e preço reais. Use buscar_produtos só pra conferir/comparar.
3. TAMANHOS — normalmente já vêm da seleção do produto. Se precisar confirmar quais vender, use opcoes com os tamanhos disponíveis.
4. PREÇO — espera "desconto" (o app mostra "Preço cheio" e um campo pra % ou R$). Não peça em texto.
5. DIFERENCIAL — o que a peça tem de ESPECIAL (tecido, caimento, cor, novidade). ESTE é o passo de escrever: espera "texto".
6. TOM — espera "opcoes", opcoes: ["😌 Suave","🔥 Agressiva"].
7. FOTO — ANTES de gerar a copy, espera "foto" (o app mostra "Subir foto"/"Seguir sem foto"). Só passe pra copy DEPOIS que ele subir a foto OU disser pra seguir sem foto.
8. Aí sim GERE a proposta (com a copy).

━━━ ROTEIRO DE DATA/GERAL (você é a ESTRATEGISTA — conduza, adapte as perguntas à data) ━━━
Você sabe de marketing; o dono não. Puxe dele o que precisa pra montar um plano forte, com botões:
1. OBJETIVO — opcoes ["Fortalecer a marca","Vender mais","Os dois"].
2. DIFERENCIAL/OFERTA — o que vamos entregar de diferente: opcoes ["Desconto agressivo","Brinde / benefício","Condição especial (frete, parcelamento)","Sem desconto, só divulgar"].
3. Se escolheu desconto → espera "desconto".
4. PÚBLICO no WhatsApp — opcoes ["Toda a base","Só clientes ativos","Só homens","Só mulheres"].
5. CANAIS — opcoes ["WhatsApp + Instagram","Só WhatsApp","Só Instagram"].
Pode pular/adicionar perguntas conforme a data pede (você é a especialista). Quando tiver o essencial, GERE o "plano" (não "proposta").
A copy de divulgação segue as MESMAS regras de copy humana/simples abaixo. Os posts de Instagram são um roteiro pronto pro dono postar (a gente não posta por ele).

REGRA DE OURO (nome do produto): o estoque tem códigos internos feios (ex: "CAMISETA MC LISTRAS BASICA (MO) OFF WHITE C/ CASTOR P"). NUNCA mostre esse código cru — nem pro cliente na copy, nem pro dono na "resposta". Descreva humano: "camiseta de listras off white". produtos_destaque é interno, mas mesmo nele use descrição limpa.

GÊNERO: produto 'M' ou 'F' → a oferta NÃO vai pro gênero oposto. Sempre passe o gênero pro casar_clientes.

FOTO (visão) — SEJA CRÍTICA E REALISTA, não elogie por elogiar: quando o dono anexar a foto (você vê a imagem), avalie de verdade se ela VENDE: luz, foco/nitidez, enquadramento, fundo (bagunçado atrapalha), se dá pra ver bem a peça, cor fiel, se parece amadora demais. Se a foto estiver ruim, FALE NA LATA que ela tem pouca chance de converter e diga o que melhorar (ex: "essa foto tá escura e o fundo tá poluído, do jeito que tá vende pouco — se der, tira outra com luz natural, a peça esticada ou num cabide, fundo limpo"). Se estiver boa, diga que tá boa e siga. O dono decide continuar mesmo assim ou trocar. Nunca empurre uma foto fraca dizendo que tá ótima.

COMO ESCREVER A COPY (O MAIS IMPORTANTE): escreva EXATAMENTE como um lojista escreve no WhatsApp — simples, direto, um pouco informal, humano. NÃO pode parecer IA nem anúncio. Curta (2 linhas).
Molde que o dono gosta: "Boa tarde {nome}, tudo bem? Chegou aqui na loja um embarque da Aramis e essa camiseta achei muito a sua cara. Se tiver interesse, tenho uma oferta especial pra você."
PROIBIDO: emoji demais (no máximo 1, de preferência nenhum), adjetivos empilhados ("tecido encorpado, fresco, caimento impecável"), frases fofas de marketing, e principalmente MOSTRAR A CONTA ("tá saindo por R$269 e consigo por R$215", "20% off"). Nada de "muito com a sua cara" grudado com "quer que eu te mande as fotinhas? 😉" — soa fake.
Estrutura simples: saudação + "chegou um embarque/uma novidade da {marca}" + "essa {peça} achei muito a sua cara" + (se tiver oferta) "se tiver interesse, tenho uma oferta especial pra você".

FOTO NA COPY: ${temFoto
  ? 'ESTA campanha VAI COM FOTO (a imagem vai junto). NÃO pergunte "quer que eu te mande as fotos?" — a foto já está ali. Só apresente natural (a peça + "achei sua cara" + oferta se tiver). Ex: "Boa tarde {nome}, tudo bem? Chegou aqui na loja essa camiseta da Aramis e achei muito a sua cara. Se tiver interesse, tenho uma oferta especial pra você."'
  : 'ESTA campanha VAI SEM FOTO. PODE terminar com "quer que eu te mande as fotos?" — quando o cliente responder, as fotos vão automaticamente.'}

PREÇO: por padrão NEM FALA de preço — só instiga e deixa o cliente perguntar. O jeito certo é "se você tiver interesse, consigo uma oferta especial nela". Quando houver desconto, gere DUAS versões da copy:
- copy_texto (PADRÃO, SEM preço): instiga sem número. Ex: "...se tiver interesse, consigo uma oferta especial nela pra você."
- copy_texto_preco (opcional, COM preço): mostra "de R$269 por R$250" (você calcula o valor final; NUNCA a %). Só essa versão cita valor.
Se NÃO houver desconto, copy_texto é o convite normal e copy_texto_preco = null.

TOM (as duas versões seguem o tom, sempre SIMPLES como o molde):
- SUAVE: sem falar de oferta. Ex: "Boa tarde {nome}, tudo bem? Chegou aqui na loja um embarque da Aramis e essa camiseta achei muito a sua cara."
- AGRESSIVA: já puxa a oferta. Ex: "Boa tarde {nome}, tudo bem? Chegou aqui na loja um embarque da Aramis e essa camiseta achei muito a sua cara. Se tiver interesse, tenho uma oferta especial pra você."
Nunca invente desconto que o dono não autorizou.

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
    "copy_texto": "copy CURTA no tom escolhido, SEM preço (instiga). Use {nome}. Natural, brasileira, NUNCA com código de produto.",
    "copy_texto_preco": "MESMA copy porém COM o preço ('de R$X por R$Y'). null se não houver desconto.",
    "produtos_destaque": ["descrição limpa dos produtos"],
    "desconto": "ex: '20%', 'R$50' ou null"
  }
}

Pra CAMPANHA DE DATA/GERAL, em vez de "proposta", preencha "plano" (proposta fica null):
{
  "resposta": "apresentando o plano e pedindo pra revisar/aprovar",
  "espera": "texto",
  "opcoes": [],
  "plano": {
    "titulo": "nome da campanha (ex: 'Dia dos Pais 2026')",
    "objetivo": "marca | venda | ambos",
    "estrategia": "3-4 linhas: o conceito/tema criativo da campanha, o gancho emocional da data, e como isso conecta com vender. Nível de agência.",
    "oferta": "o diferencial em 1 frase (ex: '20% OFF em toda a loja + brinde', 'kit presente com embalagem grátis') ou null",
    "publico_criterio": "todos | ativos | homens | mulheres",
    "publico_descricao": "quem recebe no WhatsApp e por quê",
    "copy_whatsapp": "mensagem de DIVULGAÇÃO pro WhatsApp. Diferente da mensagem 1:1 de produto: aqui pode ser mais TRABALHADA e PROFISSIONAL (é um broadcast da campanha) — gancho da data + o que a loja preparou + benefício/oferta claro + CTA. Ainda assim natural e brasileira, com {nome}. 3-4 linhas.",
    "posts_instagram": [
      {"data":"data REAL do post (ex: '06/08')","formato":"Feed | Carrossel | Story | Reels","objetivo":"teaser | oferta | prova social | bastidores | urgência","tema":"conceito do post em 1 linha","visual":"o que aparece na imagem/vídeo (direção de arte concreta)","legenda":"legenda profissional: 1ª linha um HOOK forte, corpo curto com benefício, CTA claro","hashtags":"5-8 hashtags relevantes de moda + a data + local"}
    ],
    "dica": "1 dica de execução (melhor horário de postar, stories no dia, etc.)"
  }
}
O CALENDÁRIO DO INSTAGRAM tem que ser NÍVEL PROFISSIONAL — você é social media sênior. Faça 5 a 6 posts distribuídos ao longo da campanha, com VARIEDADE real de formato e objetivo: começe com teaser/expectativa, depois revele a oferta, use prova social ou bastidores no meio, e feche com urgência/último dia. Cada legenda com HOOK na 1ª linha (nada de "chegou a data!"), benefício claro e CTA ("chama no direct", "link na bio", "passa na loja"). Datas REAIS calculadas a partir do evento. Nada genérico nem preguiçoso.`

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
        const r = await execTool(admin, user.id, block.name, block.input, generoProduto)
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

  /* Espera: o modelo às vezes esquece de setar 'foto'/'desconto' (manda
     'texto'). DETECTA o passo pela própria pergunta e SOBREPÕE nesses casos. */
  const modelEspera = ['texto', 'produto', 'foto', 'opcoes', 'desconto'].includes(parsed.espera) ? parsed.espera : ''
  let heur = ''
  if (!parsed.proposta) {
    const r = String(parsed.resposta || '').toLowerCase()
    if (/sem foto|segue sem|manda(r)?\s+(uma\s+)?foto|me\s+manda.*foto|foto d[ao]\s|uma foto/.test(r)) heur = 'foto'
    else if (/desconto|pre[çc]o cheio/.test(r)) heur = 'desconto'
    else if (/(escolh|seleci|mostra|mostre).*estoque|no estoque/.test(r)) heur = 'produto'
  }
  let espera: string = modelEspera
  /* sinais fortes (foto/desconto/produto) mandam mais que um 'texto' fraco/ausente */
  if ((heur === 'foto' || heur === 'desconto' || heur === 'produto') && (modelEspera === '' || modelEspera === 'texto')) {
    espera = heur
  }
  if (!espera) espera = opcoes.length > 0 ? 'opcoes' : 'texto'

  /* Público REAL (código, não modelo). Produto → casa por tamanho.
     Data/geral → resolve por critério (toda base / ativos / gênero). */
  let publico: { id: string; nome: string; telefone: string | null; motivo: string }[] = []
  if (parsed.proposta?.tamanhos?.length) {
    const generoFiltro = generoProduto ?? parsed.proposta.genero ?? null
    const casados = await casarClientesPorTamanho(admin, user.id, parsed.proposta.tamanhos, parsed.proposta.marca ?? null, generoFiltro)
    publico = casados.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, motivo: c.motivo }))
  } else if (parsed.plano) {
    const criterioRaw = String(parsed.plano.publico_criterio ?? 'todos').toLowerCase()
    const criterio = ['todos', 'ativos', 'homens', 'mulheres'].includes(criterioRaw) ? criterioRaw : 'todos'
    const motivo = parsed.plano.publico_descricao || 'público da campanha'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lista = await resolverPublico(admin, user.id, '', criterio as any)
    publico = lista.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, motivo }))
  }

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta ?? '',
    espera,
    opcoes,
    proposta: parsed.proposta ?? null,
    plano: parsed.plano ?? null,
    publico,
  })
}
