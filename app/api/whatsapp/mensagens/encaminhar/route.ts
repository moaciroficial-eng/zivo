import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppAudio, sendWhatsAppDocument } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { NextRequest, NextResponse } from 'next/server'

const JANELA_24H_MS = 24 * 60 * 60 * 1000

type Resultado = { contatoId: string; ok: boolean; erro?: string }

/* Encaminha UMA mensagem (texto, foto, áudio ou documento) já existente na
   conversa pra outros contatos escolhidos -- diferente de /ofertas/encaminhar,
   que é específico pra oferta (peças com preço). Só dentro da janela de 24h;
   fora disso, essa rota não manda template nenhum, só reporta o motivo. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { mensagemId, contatoIds } = await request.json().catch(() => ({})) as { mensagemId?: string; contatoIds?: string[] }
  if (!mensagemId || !Array.isArray(contatoIds) || contatoIds.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: msg } = await admin.from('whatsapp_mensagens').select('tipo, conteudo, raw').eq('id', mensagemId).eq('user_id', user.id).maybeSingle()
  if (!msg) return NextResponse.json({ ok: false, erro: 'Mensagem não encontrada.' }, { status: 404 })
  if (!['texto', 'imagem', 'audio', 'documento'].includes(msg.tipo)) {
    return NextResponse.json({ ok: false, erro: 'Esse tipo de mensagem ainda não pode ser encaminhado.' }, { status: 400 })
  }

  const loja = await getLoja(admin, user.id).catch(() => null)
  const { data: contatos } = await admin.from('whatsapp_contatos').select('id, phone').eq('user_id', user.id).in('id', contatoIds)

  const agora = Date.now()
  const resultados: Resultado[] = []

  for (const c of (contatos ?? []) as { id: string; phone: string }[]) {
    const { data: ultima } = await admin.from('whatsapp_mensagens')
      .select('timestamp').eq('contato_id', c.id).eq('direcao', 'recebida')
      .order('timestamp', { ascending: false }).limit(1).maybeSingle()
    const t = ultima?.timestamp ? new Date(ultima.timestamp).getTime() : null
    const dentroDaJanela = t != null && agora - t < JANELA_24H_MS
    if (!dentroDaJanela) {
      resultados.push({ contatoId: c.id, ok: false, erro: 'Fora da janela de 24h.' })
      continue
    }

    try {
      let messageId: string | undefined
      let conteudoSalvo = msg.conteudo ?? ''
      let rawSalvo: Record<string, unknown> = {}

      if (msg.tipo === 'texto') {
        messageId = (await sendWhatsAppMessage({ phone: c.phone, message: msg.conteudo ?? '', creds: loja?.creds, userId: user.id })).messageId
      } else if (msg.tipo === 'imagem') {
        const img = (msg.raw as { image?: { imageUrl?: string; caption?: string | null } } | null)?.image
        if (!img?.imageUrl) throw new Error('Foto original indisponível.')
        messageId = (await sendWhatsAppImage({ phone: c.phone, imageUrl: img.imageUrl, caption: img.caption ?? undefined, creds: loja?.creds, userId: user.id })).messageId
        rawSalvo = { image: { imageUrl: img.imageUrl, caption: img.caption ?? null, ofertaId: null } }
        conteudoSalvo = img.caption?.trim() || '📷 Imagem'
      } else if (msg.tipo === 'audio') {
        const aud = (msg.raw as { audio?: { audioUrl?: string; duracaoSeg?: number | null } } | null)?.audio
        if (!aud?.audioUrl) throw new Error('Áudio original indisponível.')
        messageId = (await sendWhatsAppAudio({ phone: c.phone, audioUrl: aud.audioUrl, creds: loja?.creds, userId: user.id })).messageId
        rawSalvo = { audio: { audioUrl: aud.audioUrl, duracaoSeg: aud.duracaoSeg ?? null } }
        conteudoSalvo = '🎵 Áudio'
      } else {
        const doc = (msg.raw as { document?: { url?: string; fileName?: string | null } } | null)?.document
        if (!doc?.url) throw new Error('Documento original indisponível.')
        messageId = (await sendWhatsAppDocument({ phone: c.phone, documentUrl: doc.url, filename: doc.fileName ?? undefined, creds: loja?.creds, userId: user.id })).messageId
        rawSalvo = { document: { url: doc.url, fileName: doc.fileName ?? null } }
        conteudoSalvo = doc.fileName?.trim() || '📄 Documento'
      }

      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id, contato_id: c.id, message_id: messageId ?? null,
        direcao: 'enviada', tipo: msg.tipo, conteudo: conteudoSalvo, status: 'enviada', timestamp,
        raw: rawSalvo,
      })
      await admin.from('whatsapp_contatos').update({ ultima_mensagem: conteudoSalvo, ultima_mensagem_at: timestamp }).eq('id', c.id)
      resultados.push({ contatoId: c.id, ok: true })
    } catch (e) {
      resultados.push({ contatoId: c.id, ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar.' })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
