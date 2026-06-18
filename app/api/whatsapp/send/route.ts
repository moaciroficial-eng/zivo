import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let phone: string, message: string, contatoId: string | undefined
  try {
    const body = await request.json()
    phone     = body.phone
    message   = body.message
    contatoId = body.contatoId
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!phone || !message) {
    return new NextResponse('phone e message são obrigatórios', { status: 400 })
  }

  let messageId: string | undefined
  try {
    const result = await sendWhatsAppMessage({ phone, message })
    messageId = result.messageId
  } catch (err) {
    console.error('Erro ao enviar mensagem WhatsApp:', err)
    return new NextResponse(String(err), { status: 500 })
  }

  /* Salva a mensagem enviada no banco para aparecer no histórico */
  try {
    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    /* Descobre o contato se não foi passado */
    let cId = contatoId
    if (!cId) {
      const normalized = phone.replace(/\D/g, '')
      const number = normalized.startsWith('55') ? normalized : `55${normalized}`
      const { data: c } = await admin
        .from('whatsapp_contatos')
        .select('id')
        .eq('user_id', user.id)
        .eq('phone', number)
        .maybeSingle()
      cId = c?.id
    }

    if (cId) {
      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id:    user.id,
        contato_id: cId,
        message_id: messageId ?? null,
        direcao:    'enviada',
        tipo:       'texto',
        conteudo:   message,
        status:     'enviada',
        timestamp,
      })
      await admin.from('whatsapp_contatos').update({
        ultima_mensagem:    message,
        ultima_mensagem_at: timestamp,
      }).eq('id', cId)
    }
  } catch (err) {
    console.error('Erro ao salvar mensagem no banco:', err)
    /* Não falha a resposta — mensagem foi enviada com sucesso */
  }

  return NextResponse.json({ ok: true })
}
