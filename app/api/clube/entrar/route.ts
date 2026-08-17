import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/* Login/cadastro do VIP no clube (público). Se o cadastro está aberto,
   qualquer email entra e vira membro. Se está fechado, só quem já é membro. */
export async function POST(request: NextRequest) {
  const { slug, email, nome, telefone } = await request.json() as { slug?: string; email?: string; nome?: string; telefone?: string }
  const e = (email ?? '').trim().toLowerCase()
  if (!slug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return NextResponse.json({ ok: false, erro: 'Dados inválidos.' })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: loja } = await admin.from('loja_config')
    .select('user_id, clube_ativo, clube_cadastro_aberto').eq('clube_slug', slug).maybeSingle()
  if (!loja || !loja.clube_ativo) return NextResponse.json({ ok: false, erro: 'Clube indisponível.' })

  const tel = (telefone ?? '').replace(/\D/g, '')

  const { data: existente } = await admin.from('clube_membros')
    .select('id, cliente_id, telefone').eq('user_id', loja.user_id).ilike('email', e).maybeSingle()

  // Casa com um cliente JÁ cadastrado (por telefone ou email) pra linkar
  let clienteId: string | null = existente?.cliente_id ?? null
  if (!clienteId && tel.length >= 8) {
    const { data: cli } = await admin.from('clientes').select('id').eq('user_id', loja.user_id).ilike('telefone', `%${tel.slice(-8)}`).maybeSingle()
    if (cli) clienteId = cli.id
  }
  if (!clienteId) {
    const { data: cliE } = await admin.from('clientes').select('id').eq('user_id', loja.user_id).ilike('email', e).maybeSingle()
    if (cliE) clienteId = cliE.id
  }

  if (!existente) {
    // NOVO membro
    if (!loja.clube_cadastro_aberto) {
      return NextResponse.json({ ok: false, erro: 'Esse email não está na lista VIP e o cadastro está encerrado.' })
    }
    if (tel.length < 10) {
      return NextResponse.json({ ok: false, erro: 'Informe seu WhatsApp com DDD (será sua senha nas próximas vezes).' })
    }
    await admin.from('clube_membros').insert({
      user_id: loja.user_id, email: e, nome: (nome ?? '').trim() || null, telefone: tel, cliente_id: clienteId,
    })
  } else {
    // MEMBRO existente → telefone funciona como senha
    const telSalvo = (existente.telefone ?? '').replace(/\D/g, '')
    if (telSalvo) {
      if (!tel || tel.slice(-8) !== telSalvo.slice(-8)) {
        return NextResponse.json({ ok: false, erro: 'Telefone não confere com o seu cadastro.' })
      }
    } else if (tel) {
      // membro antigo sem telefone: define agora
      await admin.from('clube_membros').update({ telefone: tel }).eq('id', existente.id)
    }
    // completa nome/vínculo que faltava
    const upd: Record<string, unknown> = {}
    if ((nome ?? '').trim()) upd.nome = (nome ?? '').trim()
    if (clienteId && !existente.cliente_id) upd.cliente_id = clienteId
    if (Object.keys(upd).length) await admin.from('clube_membros').update(upd).eq('id', existente.id)
  }

  const store = await cookies()
  store.set(`clube_${slug}`, e, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180 })
  return NextResponse.json({ ok: true })
}
