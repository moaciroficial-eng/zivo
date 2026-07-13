import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Diagnóstico interno de conversas/tarefas — protegido por WEBHOOK_SECRET.
   GET /api/debug/conversa?nome=Maria */
export async function GET(request: NextRequest) {
  if (!process.env.WEBHOOK_SECRET ||
      request.headers.get('authorization') !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const nome = request.nextUrl.searchParams.get('nome') ?? ''
  const phone = request.nextUrl.searchParams.get('phone') ?? ''

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* ?campanha=A → diagnóstico de campanha por letra + últimas tarefas */
  const letraCampanha = request.nextUrl.searchParams.get('campanha')
  if (letraCampanha) {
    const uid = request.nextUrl.searchParams.get('user') // opcional; senão pega do 1º contato
    let userId = uid
    if (!userId) {
      const { data: c1 } = await admin.from('whatsapp_contatos').select('user_id').limit(1).maybeSingle()
      userId = c1?.user_id ?? null
    }
    const { data: clientesLetra } = await admin
      .from('clientes').select('nome, telefone')
      .eq('user_id', userId).ilike('nome', `${letraCampanha}%`).limit(500)
    const arr = (clientesLetra ?? []) as { nome: string; telefone: string | null }[]
    const comTel = arr.filter(c => c.telefone && String(c.telefone).trim())
    const { data: tarefas } = await admin
      .from('agente_tarefas').select('titulo, total, concluidos, status, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(3)
    /* ?limpar=<tarefa_id> → apaga tarefa fantasma (total>0 sem estados) */
    const limpar = request.nextUrl.searchParams.get('limpar')
    if (limpar) {
      const { count } = await admin.from('agente_conversa_estado')
        .select('id', { count: 'exact', head: true }).eq('tarefa_id', limpar)
      if ((count ?? 0) === 0) {
        await admin.from('agente_tarefas').delete().eq('id', limpar).eq('user_id', userId)
        return NextResponse.json({ limpou: limpar, estados_que_tinha: count })
      }
      return NextResponse.json({ nao_limpou: limpar, tem_estados: count })
    }

    return NextResponse.json({
      letra: letraCampanha,
      total_clientes: arr.length,
      com_telefone: comTel.length,
      sem_telefone: arr.length - comTel.length,
      exemplos_sem_telefone: arr.filter(c => !c.telefone || !String(c.telefone).trim()).slice(0, 8).map(c => c.nome),
      ultimas_tarefas: tarefas,
    })
  }

  /* Sem filtro: lista os estados de conversa mais recentes pra localizar a tarefa */
  if (!nome && !phone) {
    const { data: estadosRecentes } = await admin
      .from('agente_conversa_estado')
      .select('id, tarefa_id, contato_id, status, created_at, updated_at, whatsapp_contatos(nome, phone)')
      .order('updated_at', { ascending: false })
      .limit(10)
    return NextResponse.json({ estados_recentes: estadosRecentes })
  }

  let query = admin.from('whatsapp_contatos').select('id, nome, phone, cliente_id, user_id').limit(5)
  query = phone ? query.ilike('phone', `%${phone}%`) : query.ilike('nome', `%${nome}%`)
  const { data: contatos } = await query

  const contato = contatos?.[0]
  if (!contato) return NextResponse.json({ erro: 'contato não encontrado', contatos })

  const [{ data: mensagens }, { data: estados }, { data: cliente }] = await Promise.all([
    admin.from('whatsapp_mensagens')
      .select('timestamp, direcao, conteudo, message_id, raw')
      .eq('contato_id', contato.id)
      .order('timestamp', { ascending: false })
      .limit(15),
    admin.from('agente_conversa_estado')
      .select('id, tarefa_id, status, updated_at, created_at, dados_coletados, historico')
      .eq('contato_id', contato.id)
      .order('created_at', { ascending: false })
      .limit(3),
    contato.cliente_id
      ? admin.from('clientes')
          .select('nome, data_nascimento, genero, tamanho_camiseta, tamanho_calca, tamanho_tenis')
          .eq('id', contato.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    contato,
    cliente,
    mensagens: (mensagens ?? []).map(m => ({
      ts: m.timestamp,
      dir: m.direcao,
      origem: (m.raw as { origem?: string } | null)?.origem ?? null,
      tem_message_id: !!m.message_id,
      texto: String(m.conteudo ?? '').slice(0, 90),
    })),
    estados: (estados ?? []).map(e => ({
      id: e.id,
      tarefa_id: e.tarefa_id,
      status: e.status,
      created_at: e.created_at,
      updated_at: e.updated_at,
      dados_coletados: e.dados_coletados,
      historico_len: Array.isArray(e.historico) ? e.historico.length : 0,
      historico_ultimos: Array.isArray(e.historico)
        ? e.historico.slice(-4).map((h: { papel: string; texto: string }) => `[${h.papel}] ${String(h.texto).slice(0, 70)}`)
        : [],
    })),
  })
}
