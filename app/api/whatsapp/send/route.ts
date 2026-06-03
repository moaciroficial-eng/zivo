import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let phone: string, message: string, jid: string | undefined
  try {
    const body = await request.json()
    phone   = body.phone
    message = body.message
    jid     = body.jid ?? undefined
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!phone || !message) {
    return new NextResponse('phone e message são obrigatórios', { status: 400 })
  }

  try {
    await sendWhatsAppMessage({ phone, jid, message })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro ao enviar mensagem WhatsApp:', err)
    return new NextResponse(String(err), { status: 500 })
  }
}
