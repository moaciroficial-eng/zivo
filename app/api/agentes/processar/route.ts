import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  const { contatoId, userId, timestamp, tarefaAtiva } = await request.json()
  if (!contatoId || !userId) return NextResponse.json({ ok: false })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'

  if (tarefaAtiva) {
    // Tarefa ativa: processa imediatamente sem debounce
    // Busca última mensagem recebida para passar como resposta
    const { data: newest } = await admin
      .from('whatsapp_mensagens')
      .select('conteudo')
      .eq('contato_id', contatoId)
      .eq('direcao', 'recebida')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    fetch(`${baseUrl}/api/gerente/executar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        tarefaId: tarefaAtiva.tarefa_id,
        contatoId,
        respostaContato: newest?.conteudo ?? null,
      }),
    }).catch(() => null)

    return NextResponse.json({ ok: true, processou: true, modo: 'tarefa' })
  }

  // Conversa normal: debounce de 3s para agrupar mensagens em sequência
  await new Promise(r => setTimeout(r, 3000))

  const { data: newest } = await admin
    .from('whatsapp_mensagens')
    .select('timestamp, conteudo')
    .eq('contato_id', contatoId)
    .eq('direcao', 'recebida')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  // Se chegou mensagem mais nova depois desta (com folga de 500ms), deixa ela processar
  const incomingTime = new Date(timestamp).getTime()
  const newestTime = newest?.timestamp ? new Date(newest.timestamp).getTime() : 0
  if (newestTime > incomingTime + 500) {
    return NextResponse.json({ ok: true, skipped: 'debounced' })
  }

  const mensagem = newest?.conteudo ?? ''
  if (mensagem) {
    fetch(`${baseUrl}/api/agentes/atendimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contatoId, userId, mensagem }),
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, processou: true })
}
