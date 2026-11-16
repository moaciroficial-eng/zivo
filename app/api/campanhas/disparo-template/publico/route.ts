import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { montarPublico, type FiltroPublico } from '@/lib/campanhas/disparo-template'

/* Monta a lista final de quem recebe o disparo, já com as exclusões
   automáticas aplicadas (sem telefone, duplicado, opt-out). O dono ainda
   pode tirar/adicionar gente manualmente na tela antes de criar o disparo. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const filtro = (await request.json().catch(() => ({}))) as FiltroPublico

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { pessoas, excluidos } = await montarPublico(admin, user.id, filtro)

  return NextResponse.json({ ok: true, pessoas, total: pessoas.length, excluidos })
}
