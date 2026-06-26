import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { clienteId, clienteNome } = await request.json()
  if (!clienteId) return NextResponse.json({ ok: false })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Busca contato WhatsApp vinculado ao cliente */
  const { data: contato } = await admin
    .from('whatsapp_contatos')
    .select('phone, nome')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (!contato?.phone) return NextResponse.json({ ok: false, motivo: 'sem whatsapp' })

  const { data: config } = await admin
    .from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()

  const nomeLoja = config?.nome_loja ?? 'MADS'
  const nomeCliente = (contato.nome ?? clienteNome ?? 'você').split(' ')[0]

  const mensagem = `Oi ${nomeCliente}! 😊 Obrigado pela sua compra na ${nomeLoja}! Foi um prazer te atender. Qualquer dúvida é só chamar por aqui. Até a próxima! 🛍️`

  await sendWhatsAppMessage({ phone: contato.phone, message: mensagem })

  /* Salva no histórico do chat */
  const { data: contatoId } = await admin
    .from('whatsapp_contatos').select('id').eq('phone', contato.phone).eq('user_id', user.id).maybeSingle()

  if (contatoId?.id) {
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: user.id, contato_id: contatoId.id,
      direcao: 'enviada', tipo: 'texto',
      conteudo: mensagem, status: 'enviada', timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: mensagem, ultima_mensagem_at: timestamp,
    }).eq('id', contatoId.id)
  }

  return NextResponse.json({ ok: true })
}
