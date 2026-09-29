import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppVideo } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { logErro } from '@/lib/log-erro'
import { NextRequest, NextResponse } from 'next/server'

/* Envia um vídeo pelo inbox do Terny (dono respondendo o cliente).
   Só dentro da janela de 24h; Meta limita vídeo a 16MB. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let phone: string, videoUrl: string, caption: string | undefined, contatoId: string | undefined
  try {
    const body = await request.json()
    phone     = body.phone
    videoUrl  = body.videoUrl
    caption   = body.caption
    contatoId = body.contatoId
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!phone || !videoUrl) return new NextResponse('phone e videoUrl são obrigatórios', { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)

  let messageId: string | undefined
  try {
    const r = await sendWhatsAppVideo({ phone, videoUrl, caption: caption || undefined, creds: loja?.creds })
    messageId = r.messageId
  } catch (err) {
    await logErro('whatsapp/send-video', err, { phone }, user.id)
    return new NextResponse(String(err), { status: 500 })
  }

  try {
    let cId = contatoId
    if (!cId) {
      const normalized = phone.replace(/\D/g, '')
      const number = normalized.startsWith('55') ? normalized : `55${normalized}`
      const { data: c } = await admin.from('whatsapp_contatos').select('id')
        .eq('user_id', user.id).eq('phone', number).maybeSingle()
      cId = c?.id
    }
    if (cId) {
      const timestamp = new Date().toISOString()
      const preview = caption?.trim() || '🎥 Vídeo'
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id,
        contato_id: cId,
        message_id: messageId ?? null,
        direcao: 'enviada',
        tipo: 'video',
        conteudo: preview,
        status: 'enviada',
        timestamp,
        raw: { video: { videoUrl, caption: caption ?? null } },
      })
      await admin.from('whatsapp_contatos').update({
        ultima_mensagem: preview, ultima_mensagem_at: timestamp,
      }).eq('id', cId)
    }
  } catch (err) {
    await logErro('whatsapp/send-video:save', err, undefined, user.id)
  }

  return NextResponse.json({ ok: true })
}
