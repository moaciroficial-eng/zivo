import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { processarRespostaTarefa } from '@/lib/agentes/tarefa-executor'

export async function POST(request: NextRequest) {
  const { userId, tarefaId, contatoId, respostaContato } = await request.json()
  if (!userId || !tarefaId || !contatoId) {
    return NextResponse.json({ ok: false, error: 'params obrigatórios' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: tarefa }, { data: estados }, { data: contato }] = await Promise.all([
    admin.from('agente_tarefas').select('id, instrucao, concluidos, total').eq('id', tarefaId).single(),
    admin.from('agente_conversa_estado').select('id, tarefa_id, status, historico, dados_coletados').eq('tarefa_id', tarefaId).eq('contato_id', contatoId).order('updated_at', { ascending: false }).limit(1),
    admin.from('whatsapp_contatos').select('id, nome, phone, cliente_id').eq('id', contatoId).single(),
  ])
  const estado = Array.isArray(estados) ? estados[0] ?? null : null

  if (!tarefa || !estado || !contato) return NextResponse.json({ ok: false, error: 'não encontrado' })
  if (estado.status === 'concluido') return NextResponse.json({ ok: true, skipped: 'já concluído' })

  const resultado = await processarRespostaTarefa(
    admin, userId,
    { id: tarefa.id, instrucao: tarefa.instrucao, concluidos: tarefa.concluidos ?? 0, total: tarefa.total ?? 1 },
    { id: estado.id, tarefa_id: tarefaId, status: estado.status, historico: estado.historico ?? [], dados_coletados: estado.dados_coletados ?? {} },
    { id: contatoId, nome: contato.nome, phone: contato.phone, cliente_id: contato.cliente_id ?? null },
    respostaContato ?? null,
  )

  return NextResponse.json({ ok: true, ...resultado })
}
