import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { normalizarTelefoneBR, primeiroNome } from '@/lib/whatsapp'

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

  /* 1. Contato pelo cliente_id direto */
  let contato: { id: string; phone: string; nome: string | null } | null = null
  const { data: c1 } = await admin
    .from('whatsapp_contatos').select('id, phone, nome')
    .eq('user_id', user.id).eq('cliente_id', clienteId).maybeSingle()

  if (c1?.phone) {
    contato = c1
  } else {
    /* 2. Fallback: acha pelo telefone do cliente; se não existir contato, CRIA
       (assim a venda de balcão vira um contato e aparece no WhatsApp do Zivo). */
    const { data: cliente } = await admin
      .from('clientes').select('telefone, nome').eq('id', clienteId).maybeSingle()

    if (cliente?.telefone) {
      const phoneLast = cliente.telefone.replace(/\D/g, '').slice(-8)
      const { data: c2 } = await admin
        .from('whatsapp_contatos').select('id, phone, nome')
        .eq('user_id', user.id).ilike('phone', `%${phoneLast}`).maybeSingle()

      if (c2?.phone) {
        contato = { ...c2, nome: c2.nome ?? cliente.nome }
        await admin.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', c2.id)
      } else {
        const phone = normalizarTelefoneBR(cliente.telefone)
        const { data: novo } = await admin.from('whatsapp_contatos').insert({
          user_id: user.id, phone, nome: cliente.nome ?? clienteNome ?? null, cliente_id: clienteId,
        }).select('id, phone, nome').single()
        if (novo?.phone) contato = novo
      }
    }
  }

  if (!contato?.phone) {
    return NextResponse.json({ ok: false, motivo: 'sem telefone' })
  }

  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'
  const nomeCliente = primeiroNome(contato.nome ?? clienteNome)  // '' se for email/vazio
  const saud = nomeCliente ? `, ${nomeCliente}` : ''

  const variantes = [
    `Obrigado pela sua compra${saud}! 🙏\nFoi um prazer te atender.\n\n${nomeLoja}`,
    `Parabéns pela escolha${saud}! 😊\nFoi um prazer te atender.\n\n${nomeLoja}`,
  ]
  const mensagem = variantes[Math.floor(Math.random() * variantes.length)]

  /* Window-aware: quente → texto livre; frio → template de agradecimento.
     Sem isso, venda de balcão (cliente frio) era rejeitada pela Meta e a
     mensagem nem aparecia no histórico. */
  const r = await enviarOferta(admin, {
    userId: user.id,
    contatoId: contato.id,
    phone: contato.phone,
    texto: mensagem,
    templateName: 'agradecimento_compra',
    templateVars: [nomeCliente, nomeLoja],
    creds: loja?.creds,
  })

  if (!r.ok) {
    console.error('[pos-venda] falha no envio:', r.erro)
    return NextResponse.json({ ok: false, motivo: r.erro ?? 'falha no envio' })
  }
  return NextResponse.json({ ok: true, via: r.via })
}
