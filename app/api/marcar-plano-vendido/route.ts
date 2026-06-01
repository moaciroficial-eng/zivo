import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Normaliza nome para comparação: minúsculo, sem acento, só alfanumérico
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function nomesCoincide(nomePlano: string, nomeVenda: string): boolean {
  const a = normalize(nomePlano)
  const b = normalize(nomeVenda)
  // Match se um contém o outro ou se as primeiras 3 palavras batem
  if (a.includes(b) || b.includes(a)) return true
  const wordsA = a.split(' ').slice(0, 3).join(' ')
  const wordsB = b.split(' ').slice(0, 3).join(' ')
  return wordsA === wordsB
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { mes, data_venda, produtos_vendidos } = body as {
    mes?: string
    data_venda?: string
    produtos_vendidos?: { nome: string }[]
  }

  if (!mes || !data_venda || !produtos_vendidos?.length) {
    return NextResponse.json({ updated: false })
  }

  const { data: metaRow } = await supabase
    .from('metas')
    .select('id, plano')
    .eq('user_id', user.id)
    .eq('mes', mes)
    .maybeSingle()

  if (!metaRow?.plano) return NextResponse.json({ updated: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plano = metaRow.plano as any
  const dias: unknown[] = plano.dias ?? []

  let touched = false

  for (const dia of dias) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = dia as any
    if (d.data !== data_venda) continue

    for (const pp of d.produtos_priorizar ?? []) {
      if (pp.vendido) continue
      const match = produtos_vendidos.some(pv => nomesCoincide(pp.nome, pv.nome))
      if (match) {
        pp.vendido = true
        touched = true
      }
    }
  }

  if (!touched) return NextResponse.json({ updated: false })

  await supabase
    .from('metas')
    .update({ plano })
    .eq('id', metaRow.id)
    .eq('user_id', user.id)

  return NextResponse.json({ updated: true })
}
