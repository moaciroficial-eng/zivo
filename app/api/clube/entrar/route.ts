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

  const { data: existente } = await admin.from('clube_membros')
    .select('id').eq('user_id', loja.user_id).ilike('email', e).maybeSingle()

  if (!existente) {
    if (!loja.clube_cadastro_aberto) {
      return NextResponse.json({ ok: false, erro: 'Cadastro encerrado — esse email não está na lista VIP.' })
    }
    await admin.from('clube_membros').insert({
      user_id: loja.user_id, email: e, nome: (nome ?? '').trim() || null, telefone: (telefone ?? '').trim() || null,
    })
  }

  const store = await cookies()
  store.set(`clube_${slug}`, e, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180 })
  return NextResponse.json({ ok: true })
}
