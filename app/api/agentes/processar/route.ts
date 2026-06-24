import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  const { contatoId, userId, timestamp, tarefaAtiva } = await request.json()
  if (!contatoId || !userId) return NextResponse.json({ ok: false })

  // Espera 3 segundos para capturar mensagens enviadas em sequência rápida
  await new Promise(r => setTimeout(r, 3000))

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca a mensagem mais recente recebida deste contato
  const { data: newest } = await admin
    .from('whatsapp_mensagens')
    .select('timestamp, conteudo')
    .eq('contato_id', contatoId)
    .eq('direcao', 'recebida')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  // Se chegou mensagem mais nova depois desta, deixa ela processar
  if (newest?.timestamp && newest.timestamp > timestamp) {
    return NextResponse.json({ ok: true, skipped: 'debounced' })
  }

  const mensagem = newest?.conteudo ?? ''
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'

  if (tarefaAtiva) {
    fetch(`${baseUrl}/api/gerente/executar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        tarefaId: tarefaAtiva.tarefa_id,
        contatoId,
        respostaContato: mensagem,
      }),
    }).catch(() => null)
  } else if (mensagem) {
    fetch(`${baseUrl}/api/agentes/atendimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contatoId, userId, mensagem }),
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, processou: true })
}
