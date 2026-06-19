import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

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

  /* Contexto: contatos disponíveis */
  const { data: contatos } = await admin
    .from('whatsapp_contatos')
    .select('id, nome, phone, funil_etapa, cliente_id')
    .eq('user_id', user.id)
    .limit(200)

  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nome, telefone, data_nascimento')
    .eq('user_id', user.id)
    .limit(200)

  const semCadastroCompleto = clientes?.filter(c => !c.data_nascimento).length ?? 0

  /* Lista unificada: WhatsApp contacts + clientes do cadastro sem WhatsApp ainda */
  const contatosIds = new Set((contatos ?? []).map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean))

  const linhasWhats = (contatos ?? []).map((c: { id: string; nome: string; phone: string }) =>
    `[WA] ${c.nome ?? c.phone} → whatsapp_id: ${c.id}`)

  const linhasCadastro = (clientes ?? [])
    .filter((c: { id: string; telefone: string | null }) => !contatosIds.has(c.id) && c.telefone)
    .map((c: { id: string; nome: string; telefone: string }) =>
      `[CAD] ${c.nome} | tel: ${c.telefone} → cliente_id: ${c.id}`)

  const listaTodos = [...linhasWhats, ...linhasCadastro].join('\n')

  const systemPrompt = `Você é o Gerente IA do Zivo, sistema de gestão de loja de roupas.
Você recebe comandos do dono da loja e coordena os agentes para executar.

PESSOAS DISPONÍVEIS ([WA] = já tem WhatsApp, [CAD] = só no cadastro):
${listaTodos || '(nenhum cadastrado ainda)'}

DADOS DA LOJA:
- Clientes sem data de nascimento: ${semCadastroCompleto}

Quando o supervisor pedir uma tarefa de mensagens automáticas, responda em JSON:
{
  "resposta": "texto amigável confirmando EXATAMENTE para quem vai enviar e pedindo confirmação",
  "tarefa": {
    "titulo": "título curto da tarefa",
    "tipo": "atualizar_cadastro | campanha | cobranca | personalizado",
    "instrucao": "instrução detalhada para o agente executar a conversa. PARA ATUALIZAR CADASTRO: perguntar APENAS (1) nome completo se o contato tiver só o primeiro nome, (2) data de nascimento, (3) tamanho de camiseta, (4) numeração de calça. Nada mais — sem CPF, endereço, email. Ser leve e rápido. Encerrar agradecendo.",
    "filtro_contatos": "todos | sem_nascimento | funil_topo | funil_fundo",
    "contatos_especificos": [],
    "clientes_especificos": []
  }
}

REGRAS:
- Pessoa com [WA]: coloque o whatsapp_id em "contatos_especificos"
- Pessoa com [CAD]: coloque o cliente_id em "clientes_especificos" (o sistema cria o contato e envia pelo telefone do cadastro)
- Para grupos genéricos use "filtro_contatos"
- Se o nome não estiver em nenhuma das listas, diga claramente qual é o problema

Se for apenas uma pergunta ou conversa (sem tarefa), responda em JSON:
{
  "resposta": "sua resposta em linguagem natural",
  "tarefa": null
}

IMPORTANTE: Responda SEMPRE em JSON válido.`

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
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { resposta: text, tarefa: null }

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
      const phone = cli.telefone.replace(/\D/g, '')
      const { data: contatoExistente } = await admin
        .from('whatsapp_contatos')
        .select('id, nome, phone')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .maybeSingle()

      if (contatoExistente) {
        contatosList.push(contatoExistente as { id: string; nome: string; phone: string })
      } else {
        /* Cria contato novo */
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
