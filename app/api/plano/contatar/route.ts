import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { normalizarTelefoneBR } from '@/lib/whatsapp'

/* Envia a oferta de um contato do PLANO DIÁRIO pelo Zivo (não abre WhatsApp
   externo): window-aware (quente=texto, frio=template), grava no chat e conta
   na cadência (inteligencia_acoes) pra o motor não sugerir o mesmo de novo. */

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}
function teaser(msg: string): string {
  let t = String(msg || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi]|opa)\b[^!.?]*[!.?]\s*/i, '')
  if (t.length > 90) t = t.slice(0, 88).replace(/\s+\S*$/, '') + '…'
  return t || 'novidades que combinam com o seu estilo'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { clienteId, nome, telefone, mensagem, foto_url } = await request.json()
  if (!mensagem || (!clienteId && !telefone)) return NextResponse.json({ ok: false, erro: 'faltam dados' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  /* resolve/cria o contato */
  let contato: { id: string; phone: string; nome: string | null } | null = null
  if (clienteId) {
    const { data: c1 } = await admin.from('whatsapp_contatos').select('id, phone, nome')
      .eq('user_id', user.id).eq('cliente_id', clienteId).maybeSingle()
    if (c1?.phone) contato = c1
  }
  if (!contato && telefone) {
    const last8 = String(telefone).replace(/\D/g, '').slice(-8)
    const { data: c2 } = await admin.from('whatsapp_contatos').select('id, phone, nome')
      .eq('user_id', user.id).ilike('phone', `%${last8}`).maybeSingle()
    if (c2?.phone) {
      contato = c2
      if (clienteId) await admin.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', c2.id)
    } else {
      const phone = normalizarTelefoneBR(telefone)
      const { data: novo } = await admin.from('whatsapp_contatos')
        .insert({ user_id: user.id, phone, nome: nome ?? null, cliente_id: clienteId ?? null })
        .select('id, phone, nome').single()
      if (novo?.phone) contato = novo
    }
  }
  if (!contato?.phone) return NextResponse.json({ ok: false, erro: 'contato sem telefone' })

  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'
  const primeiroNome = (contato.nome ?? nome ?? 'você').split(' ')[0]
  const texto = String(mensagem).replace(/\{saudacao\}/gi, saudacaoBR()).replace(/\{nome\}/gi, primeiroNome)

  const r = await enviarOferta(admin, {
    userId: user.id, contatoId: contato.id, phone: contato.phone,
    texto, templateName: 'novidade_loja',
    templateVars: [primeiroNome, nomeLoja, teaser(texto)],
    fotoUrl: foto_url ?? null, templateFotoName: 'oferta_com_foto',
    creds: loja?.creds,
  })
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro ?? 'falha no envio' }, { status: 502 })

  /* cadência: não sugerir o mesmo cliente de novo tão cedo */
  if (clienteId) {
    try { await admin.from('inteligencia_acoes').insert({ user_id: user.id, cliente_id: clienteId, mensagem: texto, enviada_em: new Date().toISOString() }) } catch { /* ignora */ }
  }

  return NextResponse.json({ ok: true, via: r.via })
}
