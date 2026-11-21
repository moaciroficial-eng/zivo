import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppImage } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { legendaOferta, type PecaOferta } from '@/lib/ofertas'
import { NextRequest, NextResponse } from 'next/server'

/* Dono clicou "Enviar agora" numa oferta que estava esperando resposta
   (mandou o template antes, cliente respondeu, agora manda as fotos). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: oferta } = await admin.from('ofertas')
    .select('id, pecas, contato_id, status').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!oferta) return NextResponse.json({ ok: false, erro: 'Oferta não encontrada.' }, { status: 404 })
  if (oferta.status !== 'aguardando_resposta') return NextResponse.json({ ok: false, erro: 'Essa oferta não está esperando envio.' }, { status: 400 })

  const { data: contato } = await admin.from('whatsapp_contatos').select('id, phone').eq('id', oferta.contato_id).maybeSingle()
  if (!contato) return NextResponse.json({ ok: false, erro: 'Contato não encontrado.' }, { status: 404 })

  const loja = await getLoja(admin, user.id).catch(() => null)
  const pecas = (oferta.pecas ?? []) as PecaOferta[]
  let ok = true
  for (const p of pecas) {
    const legenda = legendaOferta(p)
    try {
      const { messageId } = await sendWhatsAppImage({ phone: contato.phone, imageUrl: p.foto_url, caption: legenda, creds: loja?.creds, userId: user.id })
      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id, contato_id: contato.id, message_id: messageId ?? null,
        direcao: 'enviada', tipo: 'imagem', conteudo: legenda, status: 'enviada', timestamp,
        raw: { image: { imageUrl: p.foto_url, caption: legenda, ofertaId: oferta.id } },
      })
      await admin.from('whatsapp_contatos').update({ ultima_mensagem: legenda, ultima_mensagem_at: timestamp }).eq('id', contato.id)
    } catch {
      ok = false
    }
  }

  await admin.from('ofertas').update({ status: 'enviada' }).eq('id', oferta.id)
  return NextResponse.json({ ok })
}
