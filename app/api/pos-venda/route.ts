import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, motivo: 'sem sessão' }, { status: 401 })

  const { clienteId, clienteNome } = await request.json()
  if (!clienteId) return NextResponse.json({ ok: false, motivo: 'sem clienteId' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* 1. Tenta achar pelo cliente_id direto no whatsapp_contatos */
  let contato: { phone: string; nome: string | null; id?: string } | null = null

  const { data: c1 } = await admin
    .from('whatsapp_contatos')
    .select('id, phone, nome')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (c1?.phone) {
    contato = c1
  } else {
    /* 2. Fallback: busca telefone do cliente e procura contato por telefone */
    const { data: cliente } = await admin
      .from('clientes').select('telefone, nome').eq('id', clienteId).maybeSingle()

    if (cliente?.telefone) {
      const phoneLast = cliente.telefone.replace(/\D/g, '').slice(-8)
      const { data: c2 } = await admin
        .from('whatsapp_contatos')
        .select('id, phone, nome')
        .eq('user_id', user.id)
        .ilike('phone', `%${phoneLast}`)
        .maybeSingle()

      if (c2?.phone) {
        contato = { ...c2, nome: c2.nome ?? cliente.nome }
        /* Vincula cliente_id pro futuro */
        await admin.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', c2.id)
      }
    }
  }

  if (!contato?.phone) {
    console.log(`[pos-venda] cliente ${clienteId} sem WhatsApp vinculado`)
    return NextResponse.json({ ok: false, motivo: 'sem whatsapp' })
  }

  const { data: config } = await admin
    .from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()

  const nomeLoja = config?.nome_loja || 'Moca'
  const nomeCliente = (contato.nome ?? clienteNome ?? 'você').split(' ')[0]

  const mensagem = `Oi ${nomeCliente}! 😊 Obrigado pela sua compra na ${nomeLoja}! Foi um prazer te atender. Qualquer dúvida é só chamar por aqui. Até a próxima! 🛍️`

  try {
    await sendWhatsAppMessage({ phone: contato.phone, message: mensagem })
  } catch (err) {
    console.error('[pos-venda] erro ao enviar:', err)
    return NextResponse.json({ ok: false, motivo: String(err) })
  }

  /* Salva no histórico do chat */
  const contatoId = contato.id
  if (contatoId) {
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: user.id, contato_id: contatoId,
      direcao: 'enviada', tipo: 'texto',
      conteudo: mensagem, status: 'enviada', timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: mensagem, ultima_mensagem_at: timestamp,
    }).eq('id', contatoId)
  }

  return NextResponse.json({ ok: true })
}
