import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppImage, sendWhatsAppTemplate, primeiroNome } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { legendaOferta, type PecaOferta } from '@/lib/ofertas'
import { NextRequest, NextResponse } from 'next/server'

const JANELA_24H_MS = 24 * 60 * 60 * 1000

type Resultado = { contatoId: string; ok: boolean; modo: 'fotos' | 'template'; erro?: string }

/* Encaminha a oferta (copiada do quadro) pros contatos escolhidos:
   - dentro da janela de 24h → manda as fotos com legenda de/por direto;
   - fora → manda o template aprovado e salva a oferta como "aguardando_resposta"
     (o dono manda as fotos manualmente depois, com 1 clique, quando a pessoa responder --
     nada automático aqui). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { origemOfertaId, pecas, contatoIds, templateName } = await request.json().catch(() => ({})) as {
    origemOfertaId?: string; pecas?: PecaOferta[]; contatoIds?: string[]; templateName?: string
  }
  if (!Array.isArray(pecas) || pecas.length === 0 || !Array.isArray(contatoIds) || contatoIds.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Oferta ou contatos inválidos.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)

  const { data: contatos } = await admin.from('whatsapp_contatos')
    .select('id, nome, phone, cliente_id').eq('user_id', user.id).in('id', contatoIds)

  const agora = Date.now()
  const resultados: Resultado[] = []

  for (const c of (contatos ?? []) as { id: string; nome: string | null; phone: string; cliente_id: string | null }[]) {
    const { data: ultima } = await admin.from('whatsapp_mensagens')
      .select('timestamp').eq('contato_id', c.id).eq('direcao', 'recebida')
      .order('timestamp', { ascending: false }).limit(1).maybeSingle()
    const t = ultima?.timestamp ? new Date(ultima.timestamp).getTime() : null
    const dentroDaJanela = t != null && agora - t < JANELA_24H_MS

    if (dentroDaJanela) {
      const { data: oferta } = await admin.from('ofertas').insert({
        user_id: user.id, contato_id: c.id, cliente_id: c.cliente_id,
        origem_oferta_id: origemOfertaId ?? null, pecas, status: 'enviada',
      }).select('id').single()

      let ok = true
      for (const p of pecas) {
        const legenda = legendaOferta(p)
        try {
          const { messageId } = await sendWhatsAppImage({ phone: c.phone, imageUrl: p.foto_url, caption: legenda, creds: loja?.creds, userId: user.id })
          const timestamp = new Date().toISOString()
          await admin.from('whatsapp_mensagens').insert({
            user_id: user.id, contato_id: c.id, message_id: messageId ?? null,
            direcao: 'enviada', tipo: 'imagem', conteudo: legenda, status: 'enviada', timestamp,
            raw: { image: { imageUrl: p.foto_url, caption: legenda, ofertaId: oferta?.id ?? null } },
          })
          await admin.from('whatsapp_contatos').update({ ultima_mensagem: legenda, ultima_mensagem_at: timestamp }).eq('id', c.id)
        } catch {
          ok = false
        }
      }
      resultados.push({ contatoId: c.id, ok, modo: 'fotos' })
    } else {
      if (!templateName) { resultados.push({ contatoId: c.id, ok: false, modo: 'template', erro: 'Fora da janela de 24h e nenhum template escolhido.' }); continue }
      await admin.from('ofertas').insert({
        user_id: user.id, contato_id: c.id, cliente_id: c.cliente_id,
        origem_oferta_id: origemOfertaId ?? null, pecas, status: 'aguardando_resposta', template_enviado: templateName,
      })
      try {
        const { messageId } = await sendWhatsAppTemplate({ phone: c.phone, templateName, variaveis: [primeiroNome(c.nome, 'você')], creds: loja?.creds, userId: user.id })
        /* Grava no histórico -- sem isso o template enviado por aqui nunca
           aparecia na conversa e nunca ganhava tique de status. */
        const conteudo = `📄 ${templateName}`
        const timestamp = new Date().toISOString()
        await admin.from('whatsapp_mensagens').insert({
          user_id: user.id, contato_id: c.id, message_id: messageId ?? null,
          direcao: 'enviada', tipo: 'template', conteudo, status: 'enviada', timestamp,
          raw: { template: { nome: templateName } },
        })
        await admin.from('whatsapp_contatos').update({ ultima_mensagem: conteudo, ultima_mensagem_at: timestamp }).eq('id', c.id)
        resultados.push({ contatoId: c.id, ok: true, modo: 'template' })
      } catch (e) {
        resultados.push({ contatoId: c.id, ok: false, modo: 'template', erro: e instanceof Error ? e.message : 'Falha ao enviar o template.' })
      }
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
