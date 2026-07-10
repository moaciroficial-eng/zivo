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
  if (!nome) return NextResponse.json({ erro: 'passe ?nome=' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: contatos } = await admin
    .from('whatsapp_contatos')
    .select('id, nome, phone, cliente_id')
    .ilike('nome', `%${nome}%`)
    .limit(3)

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
