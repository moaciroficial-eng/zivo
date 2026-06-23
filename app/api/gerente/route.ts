import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { diagnosticoEstoque, buscarProduto } from '@/lib/agentes/estoquista'
import { situacaoFinanceira } from '@/lib/agentes/financeiro'
import { diagnosticoCompleto } from '@/lib/agentes/analitico'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    admin.from('clientes').select('id, nome, telefone, data_nascimento').eq('user_id', user.id).limit(1000),
    admin.from('vendas').select('cliente_id, cliente_nome, produtos').eq('user_id', user.id).gte('created_at', inicioMes).limit(500),
    admin.from('estoque').select('id, nome, marca, cor, tamanhos').eq('user_id', user.id).eq('status', 'disponivel').limit(500),
  ])

  const semCadastroCompleto = clientes?.filter(c => !c.data_nascimento).length ?? 0

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

  /* Resumo compacto do estoque por marca */
  type TamanhoItem = { tamanho: string; qtd: number }
  const marcaEstoqueMap = new Map<string, { total: number; criticos: string[] }>()
  for (const item of (estoque ?? [])) {
    const marca = (item.marca ?? 'Sem marca').trim()
    const qtdTotal = ((item.tamanhos ?? []) as TamanhoItem[]).reduce((s, t) => s + (t.qtd || 0), 0)
    if (!marcaEstoqueMap.has(marca)) marcaEstoqueMap.set(marca, { total: 0, criticos: [] })
    const entry = marcaEstoqueMap.get(marca)!
    entry.total += qtdTotal
    if (qtdTotal <= 2) entry.criticos.push(`${item.nome}${item.cor ? ` ${item.cor}` : ''}`)
  }
  const linhasEstoque = [...marcaEstoqueMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([marca, d]) => {
      const critico = d.criticos.length > 0 ? ` ⚠️ crítico: ${d.criticos.slice(0, 3).join(', ')}` : ''
      return `• ${marca}: ${d.total} unid.${critico}`
    })
    .join('\n')

  const systemPrompt = `Você é o Gerente IA do Zivo, sistema de gestão de loja de roupas.
Você recebe comandos do dono da loja e coordena os agentes para executar.
Você TEM ACESSO DIRETO aos dados de vendas, clientes e estoque — NUNCA diga que não tem acesso.
Quando precisar de análise mais profunda, indique "consultar_agente" no JSON.

ESTOQUE ATUAL (por marca):
${linhasEstoque || '(nenhum produto cadastrado)'}

COMPRAS DO MÊS ATUAL: ${totalVendasMes} venda(s) registrada(s)
ATENÇÃO: Esta lista abaixo é COMPLETA e DEFINITIVA — não existe "agente de vendas" separado. Use esses dados para responder perguntas sobre quem comprou o quê:
${linhasMarcas || '(nenhuma venda com produto vinculado ao estoque encontrada)'}

PESSOAS DISPONÍVEIS ([WA] = já tem WhatsApp, [CAD] = só no cadastro):
${listaTodos || '(nenhum cadastrado ainda)'}

DADOS DA LOJA:
- Clientes sem data de nascimento: ${semCadastroCompleto}

Responda SEMPRE em JSON válido com este formato:
{
  "resposta": "texto amigável para o supervisor",
  "tarefa": null,
  "consultar_agente": null
}

Para TAREFAS de mensagem automática, inclua o campo "tarefa":
{
  "resposta": "confirmando exatamente quem vai receber e pedindo confirmação",
  "tarefa": {
    "titulo": "título curto",
    "tipo": "atualizar_cadastro | campanha | cobranca | personalizado",
    "instrucao": "instrução para o agente executar. ATUALIZAR CADASTRO: perguntar apenas nome completo, data de nascimento, tamanho camiseta, numeração calça. Ser rápido e encerrar agradecendo.",
    "filtro_contatos": "todos | sem_nascimento | funil_topo | funil_fundo",
    "contatos_especificos": [],
    "clientes_especificos": []
  },
  "consultar_agente": null
}

Use "consultar_agente" APENAS para análises financeiras ou de diagnóstico, NUNCA para perguntas sobre quem comprou uma marca (você já tem esses dados):
{
  "resposta": "Deixa eu verificar...",
  "tarefa": null,
  "consultar_agente": "financeiro | estoque | diagnostico",
  "filtro_busca": "termo se for busca no estoque"
}

REGRAS IMPORTANTES:
- Perguntas sobre quem comprou qual marca → responda DIRETO usando os dados de COMPRAS DO MÊS ATUAL acima. NUNCA diga que não tem ou que precisa consultar outro agente.
- [WA] → whatsapp_id em "contatos_especificos"
- [CAD] → cliente_id em "clientes_especificos"
- Grupos genéricos → "filtro_contatos"
- "consultar_agente: financeiro" → só para faturamento, metas, receita
- "consultar_agente: estoque" → só para análise profunda de inventário
- NUNCA invente dados que não estão na lista acima`

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
      if (parsed.consultar_agente === 'estoque') {
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
    previewContatos,
    msgId: msgGerente?.id,
  })
}

/* Confirmar e executar uma tarefa */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { tarefa } = await request.json()

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Seleciona contatos com base no filtro ou lista específica */
  let contatosList: { id: string; nome: string; phone: string }[] = []

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
        .select('id, nome, phone')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .maybeSingle()

      if (contatoExistente) {
        contatosList.push(contatoExistente as { id: string; nome: string; phone: string })
      } else {
        const { data: novoContato } = await admin
          .from('whatsapp_contatos')
          .insert({ user_id: user.id, phone, nome: cli.nome, cliente_id: cli.id, funil_etapa: 'fundo' })
          .select('id, nome, phone')
          .single()
        if (novoContato) contatosList.push(novoContato as { id: string; nome: string; phone: string })
      }
    }
  } else if (tarefa.contatos_especificos?.length > 0) {
    /* Contatos nomeados explicitamente pelo supervisor (já no WhatsApp) */
    const { data } = await admin
      .from('whatsapp_contatos')
      .select('id, nome, phone')
      .eq('user_id', user.id)
      .in('id', tarefa.contatos_especificos)
    contatosList = (data ?? []) as typeof contatosList
  } else {
    let query = admin.from('whatsapp_contatos').select('id, nome, phone').eq('user_id', user.id)
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

  const contatos = contatosList
  const lista = contatos ?? []

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

  /* Cria estado inicial para cada contato */
  if (lista.length > 0) {
    await admin.from('agente_conversa_estado').insert(
      lista.map(c => ({
        user_id:    user.id,
        tarefa_id:  novaTarefa.id,
        contato_id: c.id,
        status:     'iniciando',
      }))
    )
  }

  /* Dispara a primeira mensagem para os primeiros 10 contatos imediatamente */
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

  await admin.from('gerente_mensagens').insert({
    user_id:   user.id,
    papel:     'gerente',
    conteudo:  `✅ Tarefa "${tarefa.titulo}" criada! Iniciando com ${lista.length} contatos. As mensagens estão sendo enviadas.`,
    tarefa_id: novaTarefa.id,
  })

  return NextResponse.json({ ok: true, tarefaId: novaTarefa.id, total: lista.length })
}
