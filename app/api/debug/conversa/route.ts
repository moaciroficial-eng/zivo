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
      .from('agente_tarefas').select('id, titulo, total, concluidos, status, created_at')
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

  /* ?curar=<tarefaId> → destrava conversas presas no "confirmar":
     promove dados de _do_cadastro, e se o cadastro está completo,
     salva no cliente e encerra. Conserta o loop de data (Abson). */
  const curarId = request.nextUrl.searchParams.get('curar')
  if (curarId) {
    const { data: estados } = await admin
      .from('agente_conversa_estado')
      .select('id, contato_id, tarefa_id, user_id, status, dados_coletados')
      .eq('tarefa_id', curarId)
      .in('status', ['aguardando', 'concluido'])
      .limit(200)

    const preench = (v: unknown) => v != null && String(v).trim() !== ''
    let curados = 0, concluidos = 0
    for (const e of (estados ?? []) as { id: string; contato_id: string; user_id: string; dados_coletados: Record<string, unknown> }[]) {
      const dados = { ...(e.dados_coletados ?? {}) }
      const doCad = (dados._do_cadastro ?? {}) as Record<string, unknown>
      let mudou = false
      for (const [k, v] of Object.entries(doCad)) {
        if (preench(v) && !preench(dados[k])) { dados[k] = v; mudou = true }
      }
      if (mudou) {
        delete dados._do_cadastro
        await admin.from('agente_conversa_estado').update({ dados_coletados: dados }).eq('id', e.id)
        curados++
      }

      /* completo? salva cadastro (idempotente) e encerra */
      const isFem = String(dados.genero ?? '').toUpperCase().startsWith('F')
      const obrig = isFem
        ? ['nome', 'data_nascimento', 'tamanho_camiseta', 'tamanho_calca']
        : ['nome', 'data_nascimento', 'tamanho_camiseta', 'tamanho_calca', 'tamanho_tenis']
      if (!obrig.every(c => preench(dados[c]))) continue

      const { data: contato } = await admin
        .from('whatsapp_contatos').select('cliente_id, phone').eq('id', e.contato_id).maybeSingle()
      /* resolve o cliente: vínculo direto ou por telefone comparando SÓ
         dígitos (o telefone do cadastro tem hífen/espaço, então ilike falha) */
      let clienteId = contato?.cliente_id as string | null
      if (!clienteId && contato?.phone) {
        const last8 = String(contato.phone).replace(/\D/g, '').slice(-8)
        const { data: cands } = await admin
          .from('clientes').select('id, telefone').eq('user_id', e.user_id).not('telefone', 'is', null).limit(1000)
        const match = (cands ?? []).find((c: { telefone: string }) =>
          String(c.telefone).replace(/\D/g, '').endsWith(last8))
        if (match?.id) {
          clienteId = match.id
          await admin.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', e.contato_id)
        }
      }
      if (clienteId) {
        const upd: Record<string, string> = {}
        if (preench(dados.nome)) upd.nome = String(dados.nome)
        if (preench(dados.data_nascimento)) {
          const [dd, mm, yy] = String(dados.data_nascimento).split('/')
          if (yy) upd.data_nascimento = `${yy}-${mm}-${dd}`
        }
        for (const c of ['tamanho_camiseta', 'tamanho_calca', 'tamanho_tenis']) {
          if (preench(dados[c]) && String(dados[c]).toLowerCase() !== 'recusado') upd[c] = String(dados[c])
        }
        if (Object.keys(upd).length) await admin.from('clientes').update(upd).eq('id', clienteId)
      }
      await admin.from('agente_conversa_estado').update({ status: 'concluido' }).eq('id', e.id)
      concluidos++
    }
    return NextResponse.json({ curados, concluidos, total_aguardando: (estados ?? []).length })
  }

  /* ?tarefa=<id> → contagem de estados por status dessa campanha */
  const tarefaId = request.nextUrl.searchParams.get('tarefa')
  if (tarefaId) {
    const { data: estados } = await admin
      .from('agente_conversa_estado')
      .select('status, updated_at')
      .eq('tarefa_id', tarefaId)
      .limit(500)
    const arr = (estados ?? []) as { status: string; updated_at: string }[]
    const porStatus: Record<string, number> = {}
    for (const e of arr) porStatus[e.status] = (porStatus[e.status] ?? 0) + 1
    const maisAntigoIniciando = arr
      .filter(e => e.status === 'iniciando')
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0]
    return NextResponse.json({
      total_estados: arr.length,
      por_status: porStatus,
      iniciando_ha: maisAntigoIniciando
        ? `${Math.round((Date.now() - new Date(maisAntigoIniciando.updated_at).getTime()) / 60000)} min`
        : null,
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
