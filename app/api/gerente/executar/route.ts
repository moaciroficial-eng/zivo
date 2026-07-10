import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { executarTurnoTarefa } from '@/lib/agentes/tarefa-executor'

/* Retries de trava + debounce + chamada ao modelo podem levar ~30s */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { userId, tarefaId, contatoId } = await request.json()
  if (!userId || !tarefaId || !contatoId) {
    return NextResponse.json({ ok: false, error: 'params obrigatórios' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Toda a orquestração (trava, agregação de mensagens, encadeamento)
     vive em executarTurnoTarefa — único caminho de processamento */
  const resultado = await executarTurnoTarefa(admin, userId, tarefaId, contatoId)
  return NextResponse.json(resultado)
}
