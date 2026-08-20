import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { primeiroNome } from '@/lib/whatsapp'

/* DEBUG: dispara a abertura de atualizacao_cadastro pra um contato e devolve
   o RESULTADO CRU (incl. erro da Meta) — pra diagnosticar por que não envia.
   GET /api/debug/cadastro-teste?fone=<ultimos 8 digitos> */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'não logado' }, { status: 401 })

  const fone = (request.nextUrl.searchParams.get('fone') || '').replace(/\D/g, '')
  if (!fone) return NextResponse.json({ ok: false, erro: 'passe ?fone=<numero>' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: contato } = await admin.from('whatsapp_contatos')
    .select('id, phone, nome').eq('user_id', user.id).ilike('phone', `%${fone.slice(-8)}%`).maybeSingle()
  if (!contato?.phone) return NextResponse.json({ ok: false, erro: 'contato não encontrado', fragmento: fone.slice(-8) })

  const loja = await getLoja(admin, user.id).catch(() => null)
  const nome = primeiroNome(contato.nome, 'você')
  const nomeLoja = loja?.nomeLoja || 'a loja'
  const texto = `Oi ${nome}! 😊 ${nomeLoja} aqui. Estamos atualizando o cadastro dos nossos clientes pra te atender melhor e avisar das novidades do seu estilo. Posso te fazer algumas perguntinhas rápidas?`

  const r = await enviarOferta(admin, {
    userId: user.id, contatoId: contato.id, phone: contato.phone,
    texto, templateName: 'atualizacao_cadastro',
    templateVars: [nome, nomeLoja], creds: loja?.creds,
  })

  return NextResponse.json({
    contato: { nome: contato.nome, phone_mascarado: `...${String(contato.phone).slice(-6)}` },
    creds_meta: !!loja?.creds?.meta?.accessToken,
    resultado: r,
  })
}
