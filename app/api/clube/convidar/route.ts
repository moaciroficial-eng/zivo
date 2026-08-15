import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { normalizarTelefoneBR } from '@/lib/whatsapp'

/* Convida todos os clientes pro Clube: manda o link no WhatsApp (window-aware).
   Quem está na janela de 24h recebe o texto com o LINK; quem está frio recebe
   o template de novidade (nudge). Auto-cadastro acontece quando o cliente
   abre o link e informa o email. */

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'

  const { data: cfg } = await admin.from('loja_config').select('clube_slug, clube_ativo').eq('user_id', user.id).maybeSingle()
  if (!cfg?.clube_slug) return NextResponse.json({ ok: false, erro: 'Clube sem link configurado.' })
  if (!cfg?.clube_ativo) return NextResponse.json({ ok: false, erro: 'Ative o clube antes de convidar.' })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://zivo-navy.vercel.app'
  const link = `${origin}/clube/${cfg.clube_slug}`

  const { data: clientes } = await admin.from('clientes')
    .select('id, nome, telefone').eq('user_id', user.id)

  let enviados = 0
  for (const c of (clientes ?? [])) {
    if (!c.telefone) continue
    const primeiroNome = (c.nome ?? 'você').split(' ')[0]
    const phone = normalizarTelefoneBR(c.telefone)

    // resolve/cria contato
    const last8 = phone.replace(/\D/g, '').slice(-8)
    let contatoId: string | null = null
    const { data: ct } = await admin.from('whatsapp_contatos').select('id').eq('user_id', user.id).ilike('phone', `%${last8}`).maybeSingle()
    if (ct?.id) contatoId = ct.id
    else {
      const { data: novo } = await admin.from('whatsapp_contatos').insert({ user_id: user.id, phone, nome: c.nome, cliente_id: c.id }).select('id').single()
      contatoId = novo?.id ?? null
    }

    const texto = `${saudacaoBR()} ${primeiroNome}! Você foi convidado(a) pro *Clube ${nomeLoja}* 👑 — ofertas secretas só pra VIP. Cadastre-se com seu email aqui e garanta acesso 👇\n${link}\n\n(depois o cadastro fecha e não dá mais pra entrar 👀)`

    const r = await enviarOferta(admin, {
      userId: user.id, contatoId, phone, texto,
      templateName: 'novidade_loja', templateVars: [primeiroNome, nomeLoja, 'abri um clube de ofertas secretas pra você'],
      creds: loja?.creds,
    })
    if (r.ok) enviados++
  }

  return NextResponse.json({ ok: true, enviados })
}
