import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { contatoId, mensagem, logId, clienteId, sugestaoId } = await request.json()
  if (!contatoId || !mensagem) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Busca telefone do contato */
  const { data: contato } = await admin
    .from('whatsapp_contatos')
    .select('phone')
    .eq('id', contatoId)
    .single()

  if (!contato?.phone) return NextResponse.json({ ok: false, error: 'Contato sem telefone' }, { status: 400 })

  /* Envia pelo WhatsApp */
  await sendWhatsAppMessage({ phone: contato.phone, message: mensagem })

  /* Salva mensagem no banco */
  const timestamp = new Date().toISOString()
  await admin.from('whatsapp_mensagens').insert({
    user_id:    user.id,
    contato_id: contatoId,
    direcao:    'enviada',
    tipo:       'texto',
    conteudo:   mensagem,
    status:     'enviada',
    timestamp,
  })
  await admin.from('whatsapp_contatos').update({
    ultima_mensagem:    mensagem,
    ultima_mensagem_at: timestamp,
  }).eq('id', contatoId)

  /* Marca log como executado */
  if (logId) {
    await admin.from('agente_logs').update({ acao: `✓ ENVIADO — ${mensagem}` }).eq('id', logId)
  }

  /* Registra ação pra cadência (evita nova sugestão/envio pro mesmo cliente em poucos dias) */
  if (clienteId) {
    try {
      await admin.from('inteligencia_acoes').insert({
        user_id: user.id, cliente_id: clienteId, mensagem, enviada_em: timestamp,
      })
    } catch { /* ignora */ }
  }

  /* Resolve a sugestão aprovada */
  if (sugestaoId) {
    await admin.from('agente_sugestoes').update({ status: 'resolvida' })
      .eq('id', sugestaoId).eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
