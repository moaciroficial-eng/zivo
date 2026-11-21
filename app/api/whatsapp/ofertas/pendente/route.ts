import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Oferta que mandou o template e está esperando o dono mandar as fotos na
   mão (manual -- nada automático) depois que o cliente responder. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const contatoId = request.nextUrl.searchParams.get('contatoId')
  if (!contatoId) return NextResponse.json({ ok: false, erro: 'contatoId é obrigatório.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('ofertas')
    .select('id, pecas, template_enviado, created_at')
    .eq('user_id', user.id).eq('contato_id', contatoId).eq('status', 'aguardando_resposta')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ ok: true, oferta: data ?? null })
}
