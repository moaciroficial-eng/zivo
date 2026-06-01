import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { mes, valor_meta } = body as { mes?: string; valor_meta?: number }

  if (!mes || valor_meta == null || valor_meta <= 0) {
    return NextResponse.json({ error: 'mes e valor_meta são obrigatórios' }, { status: 400 })
  }

  // Insert or update — avoids onConflict dependency
  const { data: existing } = await supabase
    .from('metas').select('id').eq('user_id', user.id).eq('mes', mes).maybeSingle()

  let data, error
  if (existing) {
    ;({ data, error } = await supabase
      .from('metas')
      .update({ valor_meta })
      .eq('user_id', user.id).eq('mes', mes)
      .select().single())
  } else {
    ;({ data, error } = await supabase
      .from('metas')
      .insert({ user_id: user.id, mes, valor_meta })
      .select().single())
  }

  if (error) {
    console.error('[salvar-meta]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ meta: data })
}
