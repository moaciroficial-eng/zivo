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

  const totalContatos = contatos?.length ?? 0
  const semCadastroCompleto = clientes?.filter(c => !c.data_nascimento).length ?? 0

  const systemPrompt = `Você é o Gerente IA do Zivo, sistema de gestão de loja de roupas.
Você recebe comandos do dono da loja e coordena os agentes para executar.

DADOS DA LOJA:
- Total de contatos WhatsApp: ${totalContatos}
- Clientes sem data de nascimento: ${semCadastroCompleto}

Quando o supervisor pedir uma tarefa de mensagens automáticas, responda em JSON:
{
  "resposta": "texto amigável explicando o que vai fazer e pedindo confirmação",
  "tarefa": {
    "titulo": "título curto da tarefa",
    "tipo": "atualizar_cadastro | campanha | cobranca | personalizado",
    "instrucao": "instrução detalhada para o agente executar a conversa — inclua: o objetivo, as perguntas a fazer em ordem, como guardar as respostas e como encerrar a conversa",
    "filtro_contatos": "todos | sem_nascimento | sem_tamanho | funil_topo | funil_fundo | personalizado",
    "aguardando_confirmacao": true
  }
}

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

  return NextResponse.json({
    ok: true,
    resposta: parsed.resposta,
    tarefa: parsed.tarefa ?? null,
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

  /* Seleciona contatos com base no filtro */
  let query = admin.from('whatsapp_contatos').select('id, nome, phone').eq('user_id', user.id)

  if (tarefa.filtro_contatos === 'funil_topo') query = query.eq('funil_etapa', 'topo')
  else if (tarefa.filtro_contatos === 'funil_fundo') query = query.eq('funil_etapa', 'fundo')
  else if (tarefa.filtro_contatos === 'sem_nascimento') {
    /* Clientes sem data de nascimento */
    const { data: semNasc } = await admin.from('clientes').select('id').eq('user_id', user.id).is('data_nascimento', null)
    const ids = (semNasc ?? []).map(c => c.id)
    if (ids.length > 0) query = query.in('cliente_id', ids)
  }

  const { data: contatos } = await query.limit(500)
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
