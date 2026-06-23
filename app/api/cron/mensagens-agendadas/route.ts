import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function GET() {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Busca mensagens pendentes com enviar_em já vencido */
  const { data: pendentes } = await admin
    .from('mensagens_agendadas')
    .select('id, user_id, tipo, cliente_id, venda_id')
    .eq('enviada', false)
    .lte('enviar_em', new Date().toISOString())
    .limit(50)

  if (!pendentes?.length) {
    return NextResponse.json({ ok: true, processadas: 0 })
  }

  let enviadas = 0
  let erros = 0

  for (const msg of pendentes) {
    try {
      /* Busca o whatsapp_contato vinculado ao cliente */
      const { data: contato } = await admin
        .from('whatsapp_contatos')
        .select('phone, nome')
        .eq('user_id', msg.user_id)
        .eq('cliente_id', msg.cliente_id)
        .maybeSingle()

      if (!contato?.phone) {
        await admin.from('mensagens_agendadas').update({
          enviada: true, enviada_em: new Date().toISOString(),
          erro: 'cliente sem whatsapp vinculado',
        }).eq('id', msg.id)
        continue
      }

      /* Busca config da loja para personalizar */
      const { data: config } = await admin
        .from('loja_config').select('nome_loja').eq('user_id', msg.user_id).maybeSingle()

      const nomeLoja = config?.nome_loja ?? 'MADS'
      const nomeCliente = contato.nome?.split(' ')[0] ?? 'você'

      let mensagem = ''
      if (msg.tipo === 'pos_venda') {
        mensagem = `Oi ${nomeCliente}! 😊 Obrigada pela sua compra na ${nomeLoja}! Foi um prazer te atender. Qualquer dúvida é só chamar por aqui. Até a próxima! 🛍️`
      }

      if (!mensagem) continue

      await sendWhatsAppMessage({ phone: contato.phone, message: mensagem })

      /* Salva mensagem no histórico */
      const { data: contatoCompleto } = await admin
        .from('whatsapp_contatos').select('id').eq('phone', contato.phone).eq('user_id', msg.user_id).maybeSingle()

      if (contatoCompleto?.id) {
        const timestamp = new Date().toISOString()
        await admin.from('whatsapp_mensagens').insert({
          user_id: msg.user_id, contato_id: contatoCompleto.id,
          direcao: 'enviada', tipo: 'texto',
          conteudo: mensagem, status: 'enviada', timestamp,
        })
        await admin.from('whatsapp_contatos').update({
          ultima_mensagem: mensagem, ultima_mensagem_at: timestamp,
        }).eq('id', contatoCompleto.id)
      }

      await admin.from('mensagens_agendadas').update({
        enviada: true, enviada_em: new Date().toISOString(),
      }).eq('id', msg.id)

      enviadas++
    } catch (err) {
      await admin.from('mensagens_agendadas').update({
        enviada: true, enviada_em: new Date().toISOString(),
        erro: String(err),
      }).eq('id', msg.id)
      erros++
    }
  }

  return NextResponse.json({ ok: true, processadas: enviadas, erros })
}
