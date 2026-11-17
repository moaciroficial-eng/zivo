import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppAudio } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { logErro } from '@/lib/log-erro'
import { NextRequest, NextResponse } from 'next/server'

/* Envia uma nota de voz pelo inbox do Terny. O navegador já converteu pra
   OGG/Opus e subiu em audios/<uid>/... antes de chamar aqui -- esta rota só
   dispara pela Cloud API e salva o histórico. Só na janela de 24h. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let phone: string, audioUrl: string, contatoId: string | undefined, duracaoSeg: number | undefined
  try {
    const body = await request.json()
    phone      = body.phone
    audioUrl   = body.audioUrl
    contatoId  = body.contatoId
    duracaoSeg = typeof body.duracaoSeg === 'number' ? body.duracaoSeg : undefined
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!phone || !audioUrl) return new NextResponse('phone e audioUrl são obrigatórios', { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)

  let messageId: string | undefined
  try {
    const r = await sendWhatsAppAudio({ phone, audioUrl, creds: loja?.creds })
    messageId = r.messageId
  } catch (err) {
    await logErro('whatsapp/send-audio', err, { phone }, user.id)
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
      const preview = '🎵 Áudio'
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id,
        contato_id: cId,
        message_id: messageId ?? null,
        direcao: 'enviada',
        tipo: 'audio',
        conteudo: preview,
        status: 'enviada',
        timestamp,
        raw: { audio: { audioUrl, duracaoSeg: duracaoSeg ?? null } },
      })
      await admin.from('whatsapp_contatos').update({
        ultima_mensagem: preview, ultima_mensagem_at: timestamp,
      }).eq('id', cId)
    }
  } catch (err) {
    await logErro('whatsapp/send-audio:save', err, undefined, user.id)
  }

  return NextResponse.json({ ok: true })
}
