import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Busca simples de clientes por nome (pra "adicionar cliente" numa oferta
   quando o produto não casou com ninguém automaticamente). */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const termo = (request.nextUrl.searchParams.get('termo') || '').trim()
  let q = supabase.from('clientes').select('id, nome, telefone').eq('user_id', user.id)
  if (termo) q = q.ilike('nome', `%${termo}%`)
  const { data } = await q.order('nome', { ascending: true }).limit(20)

  return NextResponse.json({ clientes: (data ?? []).filter(c => c.telefone) })
}
