import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { diagnosticoEstoque, buscarProduto } from '@/lib/agentes/estoquista'
import { situacaoFinanceira } from '@/lib/agentes/financeiro'
import { diagnosticoCompleto, clientesPorMarca } from '@/lib/agentes/analitico'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function inferCategoria(nome: string): string {
  const n = nome.toUpperCase()
  if (/(?<![A-Z])POLO(?![A-Z])/.test(n))                                    return 'polo'
  if (/CAMISETA|T[-\s]?SHIRT/.test(n))                                      return 'camiseta'
  if (/(?<![A-Z])BLUSA(?![A-Z])/.test(n))                                   return 'blusa'
  if (/(?<![A-Z])CAMISA(?![A-Z])/.test(n))                                  return 'camisa'
  if (/(?<![A-Z])REGATA(?![A-Z])/.test(n))                                  return 'regata'
  if (/BERMUDA|SHORT/.test(n))                                               return 'bermuda'
  if (/CALCA|CAL[CÇ]A|JEANS|SARJA|JOGGER|MOLETOM/.test(n))                 return 'calca'
  if (/CHINELO/.test(n))                                                     return 'chinelo'
  if (/TENIS|T[EÊ]NIS|SAPATENIS|(?<![A-Z])BOTA(?![A-Z])|SANDAL/.test(n))  return 'tenis'
  return 'outros'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { mensagem, historico = [] } = await request.json()

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Salva mensagem do supervisor */
  await admin.from('gerente_mensagens').insert({
    user_id: user.id, papel: 'supervisor', conteudo: mensagem,
  })

  /* Contexto: contatos, clientes e vendas do mês */
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { data: contatos },
    { data: clientes },
    { data: vendasMes },
    { data: estoque },
  ] = await Promise.all([
    admin.from('whatsapp_contatos').select('id, nome, phone, funil_etapa, cliente_id').eq('user_id', user.id).limit(1000),
    admin.from('clientes').select('id, nome, telefone, data_nascimento, genero, dependentes').eq('user_id', user.id).limit(1000),
    admin.from('vendas').select('cliente_id, cliente_nome, produtos').eq('user_id', user.id).gte('created_at', inicioMes).limit(500),
    admin.from('estoque').select('id, marca').eq('user_id', user.id).limit(2000),
  ])

  const semCadastroCompleto = clientes?.filter(c => !c.data_nascimento).length ?? 0
  const semGenero = clientes?.filter(c => !c.genero).length ?? 0
  const totalDependentes = clientes?.reduce((acc: number, c: { dependentes?: { id: string }[] | null }) => acc + (c.dependentes?.length ?? 0), 0) ?? 0
  const clientesComDependentes = clientes?.filter((c: { dependentes?: { id: string }[] | null }) => (c.dependentes?.length ?? 0) > 0).length ?? 0

  /* Lista unificada: WhatsApp contacts + clientes do cadastro sem WhatsApp ainda */
  const contatosIds = new Set((contatos ?? []).map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean))
  const clienteMap  = new Map((clientes ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  const linhasWhats = (contatos ?? []).map((c: { id: string; nome: string; phone: string; cliente_id: string | null }) => {
    const nomeCadastro = c.cliente_id ? clienteMap.get(c.cliente_id) : null
    const nomeExibido  = nomeCadastro && nomeCadastro !== c.nome
      ? `${c.nome ?? c.phone} (nome completo no cadastro: ${nomeCadastro})`
      : (c.nome ?? c.phone)
    return `[WA] ${nomeExibido} → whatsapp_id: ${c.id}`
  })

  const linhasCadastro = (clientes ?? [])
    .filter((c: { id: string; telefone: string | null }) => !contatosIds.has(c.id) && c.telefone)
    .map((c: { id: string; nome: string; telefone: string }) =>
      `[CAD] ${c.nome} | tel: ${c.telefone} → cliente_id: ${c.id}`)

  const listaTodos = [...linhasWhats, ...linhasCadastro].join('\n')

  /* Mapa estoque_id → marca (para enriquecer os produtos das vendas) */
  const estoqueIdToMarca = new Map(
    (estoque ?? [])
      .filter((e: { id: string; marca: string | null }) => e.id && e.marca)
      .map((e: { id: string; marca: string }) => [e.id, e.marca])
  )

  /* Mapa de marcas → clientes que compraram no mês */
  const clienteIdToWaId = new Map(
    (contatos ?? [])
      .filter((c: { cliente_id: string | null }) => c.cliente_id)
      .map((c: { id: string; cliente_id: string }) => [c.cliente_id, c.id])
  )
  const clienteIdToNome = new Map((clientes ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  const marcaClientesMap = new Map<string, { nome: string; waId: string | null; clienteId: string | null }[]>()
  let totalVendasMes = 0

  for (const venda of (vendasMes ?? [])) {
    totalVendasMes++
    const produtos = Array.isArray(venda.produtos) ? venda.produtos : []
    for (const p of produtos) {
      /* Busca marca: primeiro no produto, depois via estoque_id */
      const marca = (p?.marca ?? p?.brand ?? estoqueIdToMarca.get(p?.estoque_id) ?? '').trim()
      if (!marca) continue

      const marcaKey = marca.toLowerCase()
      if (!marcaClientesMap.has(marcaKey)) marcaClientesMap.set(marcaKey, [])
      const lista = marcaClientesMap.get(marcaKey)!

      const chave = venda.cliente_id ?? venda.cliente_nome
      const jaEsta = lista.some(x => (x.clienteId ?? x.nome) === chave)
      if (!jaEsta) {
        lista.push({
          nome: venda.cliente_id
            ? (clienteIdToNome.get(venda.cliente_id) ?? venda.cliente_nome ?? 'Cliente')
            : (venda.cliente_nome ?? 'Avulso'),
          waId: venda.cliente_id ? (clienteIdToWaId.get(venda.cliente_id) ?? null) : null,
          clienteId: venda.cliente_id ?? null,
        })
      }
    }
  }

  const linhasMarcas = [...marcaClientesMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([marca, lista]) => {
      const nomes = lista.map(x =>
        x.waId
          ? `${x.nome} (whatsapp_id: ${x.waId})`
          : `${x.nome} (cliente_id: ${x.clienteId})`
      ).join(', ')
      return `• ${marca.toUpperCase()}: ${nomes}`
    })
    .join('\n')

  /* Resumo de marcas disponíveis no estoque (para contexto do Gerente) */
  const marcasNoEstoque = [...new Set((estoque ?? []).map((e: { marca: string | null }) => e.marca).filter(Boolean))].join(', ')
  const linhasEstoque = marcasNoEstoque || '(nenhuma marca cadastrada)'

  const systemPrompt = `Você é o Gerente IA do Zivo, sistema de gestão de loja de roupas.
Você recebe comandos do dono da loja e coordena os agentes para executar.
Você TEM ACESSO DIRETO aos dados de vendas, clientes e estoque — NUNCA diga que não tem acesso.
Quando precisar de análise mais profunda, indique "consultar_agente" no JSON.

MARCAS NO ESTOQUE: ${linhasEstoque}
TOTAL DE VENDAS NO MÊS: ${totalVendasMes} venda(s)
(Para saber quem comprou uma marca específica, use consultar_agente: "vendas_marca")

PESSOAS DISPONÍVEIS ([WA] = já tem WhatsApp, [CAD] = só no cadastro):
${listaTodos || '(nenhum cadastrado ainda)'}

DADOS DA LOJA:
- Clientes sem data de nascimento: ${semCadastroCompleto}
- Clientes sem gênero cadastrado: ${semGenero}
- Clientes com dependentes cadastrados: ${clientesComDependentes} (${totalDependentes} dependentes no total)
- Marcas no estoque: ${linhasEstoque}

Responda SEMPRE em JSON válido com este formato:
{
  "resposta": "texto amigável para o supervisor",
  "tarefa": null,
  "operacao": null,
  "consultar_agente": null
}

Para TAREFAS de mensagem automática via WhatsApp, inclua o campo "tarefa":
{
  "resposta": "confirmando exatamente quem vai receber e pedindo confirmação",
  "tarefa": {
    "titulo": "título curto",
    "tipo": "atualizar_cadastro | campanha | cobranca | personalizado",
    "instrucao": "instrução para o agente executar. ATUALIZAR CADASTRO: perguntar nome completo, data de nascimento, tamanho de camiseta (para mulheres: tamanho de BLUSA, e sem tênis), numeração de calça (e tênis, só para homens). Ser rápido e encerrar agradecendo.",
    "filtro_contatos": "todos | sem_nascimento | funil_topo | funil_fundo",
    "contatos_especificos": [],
    "clientes_especificos": []
  },
  "operacao": null,
  "consultar_agente": null
}

Para OPERAÇÕES EM MASSA no banco de dados (atualizar cadastro diretamente, sem WhatsApp), use "operacao":
{
  "resposta": "Descrevendo o que vai fazer e pedindo confirmação",
  "tarefa": null,
  "operacao": {
    "tipo": "atualizar_genero_clientes",
    "descricao": "Inferir e atualizar gênero de todos os clientes sem gênero"
  }
}
Ou para produtos de marcas específicas:
{
  "resposta": "Descrevendo o que vai fazer e pedindo confirmação",
  "tarefa": null,
  "operacao": {
    "tipo": "atualizar_genero_produtos",
    "marcas": ["Aramis", "Reserva"],
    "genero": "M",
    "descricao": "Definir gênero Masculino para todos os produtos Aramis e Reserva"
  }
}

Tipos de operação disponíveis:
- "atualizar_genero_clientes" → infere gênero (M/F) dos clientes pelo nome usando IA
- "atualizar_genero_produtos" → define gênero (M/F/U/I) nos produtos de marcas específicas. Use "genero": "M" para Masculino, "F" para Feminino, "U" para Unissex, "I" para Infantil.
- "corrigir_categorias" → analisa o nome de todos os produtos e corrige a categoria (camiseta, blusa, camisa, polo, regata, calca, bermuda, tenis, chinelo, outros) onde estiver errada

Para CONSULTAR CLIENTES POR MARCA (lista completa e confiável):
{
  "resposta": "Consultando quem comprou [marca]...",
  "tarefa": null,
  "operacao": null,
  "consultar_agente": "vendas_marca",
  "filtro_busca": "nome da marca exato"
}

Para análise financeira: "consultar_agente": "financeiro"
Para estoque detalhado: "consultar_agente": "estoque"
Para diagnóstico geral: "consultar_agente": "diagnostico"

REGRAS:
- Atualizar dados diretamente no banco → USE "operacao" (não tarefa, não consultar_agente)
- Perguntou quem comprou uma marca → SEMPRE use consultar_agente: "vendas_marca". Não tente adivinhar pela lista resumida.
- [WA] → whatsapp_id em "contatos_especificos"
- [CAD] → cliente_id em "clientes_especificos"
- Grupos genéricos → "filtro_contatos"`

  const messages = [
    ...historico.map((h: { papel: string; conteudo: string }) => ({
      role: h.papel === 'supervisor' ? 'user' as const : 'assistant' as const,
      content: h.conteudo,
    })),
    { role: 'user' as const, content: mensagem },
  ]

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { resposta: text, tarefa: null, consultar_agente: null }

  /* Se o Gerente pediu consulta a agente especialista, executa e reformula */
  if (parsed.consultar_agente && !parsed.tarefa) {
    let dadosEspecialista = ''
    try {
      if (parsed.consultar_agente === 'vendas_marca' && parsed.filtro_busca) {
        dadosEspecialista = await clientesPorMarca(admin, user.id, parsed.filtro_busca)
      } else if (parsed.consultar_agente === 'estoque') {
        dadosEspecialista = parsed.filtro_busca
          ? await buscarProduto(admin as never, user.id, parsed.filtro_busca)
          : await diagnosticoEstoque(admin as never, user.id)
      } else if (parsed.consultar_agente === 'financeiro') {
        dadosEspecialista = await situacaoFinanceira(admin as never, user.id)
      } else if (parsed.consultar_agente === 'diagnostico') {
        dadosEspecialista = await diagnosticoCompleto(admin as never, user.id)
      }
    } catch { /* usa resposta original se especialista falhar */ }

    if (dadosEspecialista) {
      parsed.resposta = dadosEspecialista
    }
  }

  /* Se o Gerente quer executar uma operação em massa no banco, pré-calcula o preview */
  type OperacaoItem = { id: string; nome: string; marca?: string; genero_sugerido?: string; genero_novo?: string; genero_atual?: string }
  let operacaoPreview: OperacaoItem[] | null = null

  if (parsed.operacao && !parsed.tarefa) {
    const op = parsed.operacao

    if (op.tipo === 'atualizar_genero_clientes') {
      const { data: semGeneroClientes } = await admin
        .from('clientes').select('id, nome')
        .eq('user_id', user.id).is('genero', null).limit(200)

      if (!semGeneroClientes?.length) {
        parsed.resposta = 'Todos os clientes já têm gênero cadastrado!'
        parsed.operacao = null
      } else {
        try {
          const inferRes = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: `Você é especialista em nomes brasileiros. Para cada nome abaixo, determine o gênero (M=masculino, F=feminino). Responda SOMENTE um JSON array sem explicações. Formato exato: [{"i":0,"g":"M"},{"i":1,"g":"F"},...]\n\nNomes:\n${semGeneroClientes.map((c, i) => `${i}:${c.nome}`).join('\n')}`,
            }],
          })
          const inferText = (inferRes.content[0] as { text: string }).text
          const match = inferText.match(/\[[\s\S]*\]/)
          const inferJson: { i: number; g: string }[] = match ? JSON.parse(match[0]) : []
          operacaoPreview = semGeneroClientes.map((c, i) => {
            const found = inferJson.find(x => x.i === i)
            return { id: c.id, nome: c.nome, genero_sugerido: found?.g ?? 'M' }
          })
          const total = semGeneroClientes.length
          const resumo = operacaoPreview.slice(0, 8).map(p => `• ${p.nome}: ${p.genero_sugerido === 'M' ? '♂ M' : '♀ F'}`).join('\n')
          parsed.resposta = `Encontrei ${total} cliente(s) sem gênero. A IA inferiu pelos nomes:\n${resumo}${total > 8 ? `\n...e mais ${total - 8}` : ''}\n\nConfirma a atualização?`
        } catch {
          operacaoPreview = semGeneroClientes.map(c => ({ id: c.id, nome: c.nome, genero_sugerido: 'M' }))
          parsed.resposta = `Encontrei ${semGeneroClientes.length} cliente(s) sem gênero. Confirma a atualização pelos nomes?`
        }
      }
    } else if (op.tipo === 'corrigir_categorias') {
      const { data: todosProd } = await admin.from('estoque')
        .select('id, nome, categoria')
        .eq('user_id', user.id)
        .not('nome', 'is', null)
        .limit(2000)

      const errados = (todosProd ?? []).filter(p => {
        const sugerida = inferCategoria(p.nome)
        return sugerida !== 'outros' && sugerida !== p.categoria
      })

      if (!errados.length) {
        parsed.resposta = 'Todos os produtos já estão com a categoria correta!'
        parsed.operacao = null
      } else {
        operacaoPreview = errados.map(p => ({
          id: p.id,
          nome: p.nome,
          categoria_atual: p.categoria,
          categoria_nova: inferCategoria(p.nome),
        }))
        const resumo = errados.slice(0, 8).map(p => `• ${p.nome}: ${p.categoria} → ${inferCategoria(p.nome)}`).join('\n')
        parsed.resposta = `Encontrei ${errados.length} produto(s) com categoria errada:\n${resumo}${errados.length > 8 ? `\n...e mais ${errados.length - 8}` : ''}\n\nConfirma a correção?`
      }
    } else if (op.tipo === 'atualizar_genero_produtos') {
      const marcas: string[] = op.marcas ?? []
      const genero: string = op.genero ?? 'M'
      const generoLabel: Record<string, string> = { M: 'Masculino', F: 'Feminino', U: 'Unissex', I: 'Infantil' }

      if (!marcas.length) {
        parsed.resposta = 'Por favor, especifique quais marcas quer atualizar.'
        parsed.operacao = null
      } else {
        const { data: prodMarcas } = await admin.from('estoque')
          .select('id, nome, marca, genero')
          .eq('user_id', user.id)
          .in('marca', marcas)

        const produtos = prodMarcas ?? []
        if (!produtos.length) {
          parsed.resposta = `Não encontrei produtos das marcas: ${marcas.join(', ')}. Verifique os nomes exatos no estoque.`
          parsed.operacao = null
        } else {
          operacaoPreview = produtos.map(p => ({
            id: p.id,
            nome: p.nome,
            marca: p.marca,
            genero_atual: p.genero ?? '—',
            genero_novo: genero,
          }))
          const byMarca = marcas.map(m => `${m}: ${produtos.filter(p => p.marca === m).length} produto(s)`).join(', ')
          parsed.resposta = `Encontrei ${produtos.length} produto(s) (${byMarca}). Vou definir gênero como **${generoLabel[genero] ?? genero}** em todos.\n\nConfirma a atualização?`
        }
      }
    }
  }

  /* Salva resposta do gerente */
  const { data: msgGerente } = await admin.from('gerente_mensagens').insert({
    user_id: user.id, papel: 'gerente', conteudo: parsed.resposta,
  }).select().single()

  /* Se há tarefa, pré-calcula quantos e quem vai receber para mostrar na confirmação */
  let previewContatos: { id: string; nome: string }[] = []
  if (parsed.tarefa) {
    if (parsed.tarefa.contatos_especificos?.length > 0) {
      const { data: preview } = await admin
        .from('whatsapp_contatos').select('id, nome')
        .eq('user_id', user.id)
        .in('id', parsed.tarefa.contatos_especificos)
      previewContatos = (preview ?? []) as { id: string; nome: string }[]
    } else if (parsed.tarefa.clientes_especificos?.length > 0) {
      const { data: preview } = await admin
        .from('clientes').select('id, nome')
        .eq('user_id', user.id)
        .in('id', parsed.tarefa.clientes_especificos)
      previewContatos = (preview ?? []) as { id: string; nome: string }[]
    } else {
      let q = admin.from('whatsapp_contatos').select('id, nome').eq('user_id', user.id)
      if (parsed.tarefa.filtro_contatos === 'funil_topo') q = q.eq('funil_etapa', 'topo')
      else if (parsed.tarefa.filtro_contatos === 'funil_fundo') q = q.eq('funil_etapa', 'fundo')
      else if (parsed.tarefa.filtro_contatos === 'sem_nascimento') {
        const { data: semNasc } = await admin.from('clientes').select('id').eq('user_id', user.id).is('data_nascimento', null)
        const ids = (semNasc ?? []).map((c: { id: string }) => c.id)
        if (ids.length > 0) q = q.in('cliente_id', ids)
        else return NextResponse.json({ ok: true, resposta: 'Todos os clientes já têm data de nascimento cadastrada!', tarefa: null, previewContatos: [] })
      }
      const { data: preview } = await q.limit(500)
      previewContatos = (preview ?? []) as { id: string; nome: string }[]
    }
  }

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta,
    tarefa: parsed.tarefa ?? null,
    operacao: parsed.operacao ? { ...parsed.operacao, preview: operacaoPreview } : null,
    previewContatos,
    msgId: msgGerente?.id,
  })
}

/* Confirmar e executar uma tarefa ou operação em massa */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const body = await request.json()
  const { tarefa, operacao } = body

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* ── Operação em massa (sem WhatsApp) ── */
  if (operacao) {
    type PreviewItem = { id: string; nome: string; genero_sugerido?: string; genero_novo?: string }
    const preview: PreviewItem[] = operacao.preview ?? []

    if (operacao.tipo === 'atualizar_genero_clientes') {
      let itens = preview
      /* Se preview chegou sem genero inferido, infere agora */
      const semGeneroInferido = itens.filter(u => !u.genero_sugerido)
      if (semGeneroInferido.length > 0) {
        try {
          const anthropicLocal = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
          const inferRes = await anthropicLocal.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: `Para cada nome brasileiro abaixo, determine o gênero (M ou F). Responda SOMENTE JSON: [{"i":0,"g":"M"},...]\n${semGeneroInferido.map((c, i) => `${i}:${c.nome}`).join('\n')}`,
            }],
          })
          const t = (inferRes.content[0] as { text: string }).text
          const m = t.match(/\[[\s\S]*\]/)
          const j: { i: number; g: string }[] = m ? JSON.parse(m[0]) : []
          semGeneroInferido.forEach((c, i) => { c.genero_sugerido = j.find(x => x.i === i)?.g ?? 'M' })
        } catch { semGeneroInferido.forEach(c => { c.genero_sugerido = 'M' }) }
      }

      let updated = 0
      for (const u of itens) {
        if (!u.genero_sugerido) continue
        const { error } = await admin.from('clientes')
          .update({ genero: u.genero_sugerido })
          .eq('id', u.id).eq('user_id', user.id)
        if (!error) updated++
      }
      return NextResponse.json({ ok: true, total: updated, resposta: `✅ ${updated} cliente(s) atualizados com sucesso!` })
    }

    if (operacao.tipo === 'atualizar_genero_produtos') {
      let updated = 0
      for (const u of preview) {
        if (!u.genero_novo) continue
        const { error } = await admin.from('estoque')
          .update({ genero: u.genero_novo })
          .eq('id', u.id).eq('user_id', user.id)
        if (!error) updated++
      }
      return NextResponse.json({ ok: true, total: updated, resposta: `✅ ${updated} produto(s) atualizados com sucesso!` })
    }

    if (operacao.tipo === 'corrigir_categorias') {
      type CatItem = { id: string; nome: string; categoria_nova?: string }
      const itens = preview as CatItem[]
      let updated = 0
      for (const u of itens) {
        const cat = u.categoria_nova ?? inferCategoria(u.nome)
        const { error } = await admin.from('estoque')
          .update({ categoria: cat })
          .eq('id', u.id).eq('user_id', user.id)
        if (!error) updated++
      }
      return NextResponse.json({ ok: true, total: updated, resposta: `✅ ${updated} produto(s) com categoria corrigida!` })
    }

    return NextResponse.json({ ok: false, error: 'Operação desconhecida' }, { status: 400 })
  }

  /* Seleciona contatos com base no filtro ou lista específica */
  type ContatoTarefa = { id: string; nome: string; phone: string; cliente_id?: string | null }
  let contatosList: ContatoTarefa[] = []

  if (tarefa.clientes_especificos?.length > 0) {
    /* Clientes do cadastro — cria contato no WhatsApp se ainda não existir */
    const { data: clientesDados } = await admin
      .from('clientes')
      .select('id, nome, telefone')
      .eq('user_id', user.id)
      .in('id', tarefa.clientes_especificos)

    for (const cli of (clientesDados ?? [])) {
      if (!cli.telefone) continue
      const raw   = cli.telefone.replace(/\D/g, '')
      const phone = raw.startsWith('55') ? raw : `55${raw}`
      const { data: contatoExistente } = await admin
        .from('whatsapp_contatos')
        .select('id, nome, phone, cliente_id')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .maybeSingle()

      if (contatoExistente) {
        contatosList.push(contatoExistente as ContatoTarefa)
      } else {
        const { data: novoContato } = await admin
          .from('whatsapp_contatos')
          .insert({ user_id: user.id, phone, nome: cli.nome, cliente_id: cli.id, funil_etapa: 'fundo' })
          .select('id, nome, phone, cliente_id')
          .single()
        if (novoContato) contatosList.push(novoContato as ContatoTarefa)
      }
    }
  } else if (tarefa.contatos_especificos?.length > 0) {
    /* Contatos nomeados explicitamente pelo supervisor (já no WhatsApp) */
    const { data } = await admin
      .from('whatsapp_contatos')
      .select('id, nome, phone, cliente_id')
      .eq('user_id', user.id)
      .in('id', tarefa.contatos_especificos)
    contatosList = (data ?? []) as typeof contatosList
  } else {
    let query = admin.from('whatsapp_contatos').select('id, nome, phone, cliente_id').eq('user_id', user.id)
    if (tarefa.filtro_contatos === 'funil_topo') query = query.eq('funil_etapa', 'topo')
    else if (tarefa.filtro_contatos === 'funil_fundo') query = query.eq('funil_etapa', 'fundo')
    else if (tarefa.filtro_contatos === 'sem_nascimento') {
      const { data: semNasc } = await admin.from('clientes').select('id').eq('user_id', user.id).is('data_nascimento', null)
      const ids = (semNasc ?? []).map((c: { id: string }) => c.id)
      if (ids.length > 0) query = query.in('cliente_id', ids)
    }
    const { data } = await query.limit(500)
    contatosList = (data ?? []) as typeof contatosList
  }

  /* ── Semeia dados do cadastro: o agente só pergunta o que FALTA ── */
  type ClienteRow = {
    id: string; nome: string | null; data_nascimento: string | null; genero: string | null
    tamanho_camiseta: string | null; tamanho_calca: string | null; tamanho_tenis: string | null
  }
  const clienteIds = [...new Set(contatosList.map(c => c.cliente_id).filter(Boolean))] as string[]
  const clienteMapa = new Map<string, ClienteRow>()
  if (clienteIds.length > 0) {
    const { data: clientesRows } = await admin
      .from('clientes')
      .select('id, nome, data_nascimento, genero, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .eq('user_id', user.id)
      .in('id', clienteIds)
    for (const c of (clientesRows ?? []) as ClienteRow[]) clienteMapa.set(c.id, c)
  }

  const semearDados = (cli: ClienteRow | undefined): Record<string, string> => {
    const d: Record<string, string> = {}
    if (!cli) return d
    /* nome só conta como coletado se for completo (2+ palavras) */
    if (cli.nome && cli.nome.trim().split(/\s+/).length >= 2) d.nome = cli.nome.trim()
    if (cli.data_nascimento) {
      const [a, m, dia] = String(cli.data_nascimento).split('-')
      if (dia) d.data_nascimento = `${dia}/${m}/${a}`
    }
    if (cli.genero) d.genero = cli.genero
    if (cli.tamanho_camiseta) d.tamanho_camiseta = cli.tamanho_camiseta
    if (cli.tamanho_calca)    d.tamanho_calca    = cli.tamanho_calca
    if (cli.tamanho_tenis)    d.tamanho_tenis    = cli.tamanho_tenis
    return d
  }

  const cadastroCompleto = (d: Record<string, string>): boolean => {
    const base = !!(d.nome && d.data_nascimento && d.tamanho_camiseta && d.tamanho_calca)
    return d.genero === 'F' ? base : base && !!d.tamanho_tenis
  }

  /* Em tarefas de cadastro, quem já tem tudo não recebe mensagem nenhuma */
  let jaCompletos = 0
  const listaComSeed = contatosList.map(c => ({
    contato: c,
    seed: semearDados(c.cliente_id ? clienteMapa.get(c.cliente_id) : undefined),
  })).filter(item => {
    if (tarefa.tipo === 'atualizar_cadastro' && cadastroCompleto(item.seed)) {
      jaCompletos++
      return false
    }
    return true
  })

  const lista = listaComSeed.map(i => i.contato)

  /* Ninguém pra contatar (ex: todos já com cadastro completo) */
  if (lista.length === 0) {
    const msgVazia = jaCompletos > 0
      ? `✅ Nada a fazer: os ${jaCompletos} contato(s) já estão com o cadastro completo. Ninguém recebeu mensagem.`
      : 'Nenhum contato encontrado para essa tarefa.'
    await admin.from('gerente_mensagens').insert({ user_id: user.id, papel: 'gerente', conteudo: msgVazia })
    return NextResponse.json({ ok: true, total: 0, jaCompletos, resposta: msgVazia })
  }

  /* Cancela conversas de tarefas anteriores desses contatos —
     evita dois agentes disputando a mesma conversa */
  await admin.from('agente_conversa_estado')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .in('contato_id', lista.map(c => c.id))
    .in('status', ['iniciando', 'aguardando', 'processando'])

  /* Cria a tarefa */
  const { data: novaTarefa } = await admin.from('agente_tarefas').insert({
    user_id:   user.id,
    titulo:    tarefa.titulo,
    instrucao: tarefa.instrucao,
    tipo:      tarefa.tipo,
    status:    'ativa',
    total:     lista.length,
  }).select().single()

  if (!novaTarefa) return NextResponse.json({ ok: false, error: 'Erro ao criar tarefa' }, { status: 500 })

  /* Cria estado inicial para cada contato, já semeado com o que o cadastro sabe */
  await admin.from('agente_conversa_estado').insert(
    listaComSeed.map(({ contato, seed }) => ({
      user_id:         user.id,
      tarefa_id:       novaTarefa.id,
      contato_id:      contato.id,
      status:          'iniciando',
      dados_coletados: seed,
    }))
  )

  /* Dispara a primeira mensagem para os primeiros 10 contatos imediatamente.
     Os demais são encadeados pelo executor conforme cada envio inicial conclui. */
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  const primeiros = lista.slice(0, 10)
  for (const contato of primeiros) {
    fetch(`${baseUrl}/api/gerente/executar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:    user.id,
        tarefaId:  novaTarefa.id,
        contatoId: contato.id,
      }),
    }).catch(() => null)
  }

  const notaCompletos = jaCompletos > 0 ? ` ${jaCompletos} contato(s) já estavam completos e foram pulados.` : ''
  await admin.from('gerente_mensagens').insert({
    user_id:   user.id,
    papel:     'gerente',
    conteudo:  `✅ Tarefa "${tarefa.titulo}" criada! Iniciando com ${lista.length} contatos. As mensagens estão sendo enviadas.${notaCompletos}`,
    tarefa_id: novaTarefa.id,
  })

  return NextResponse.json({ ok: true, tarefaId: novaTarefa.id, total: lista.length, jaCompletos })
}
