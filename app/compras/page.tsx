import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ComprasClient from './ComprasClient'

export default async function ComprasPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: rows }, { data: clientes }] = await Promise.all([
    supabase.from('estoque').select('marca').eq('user_id', user.id).not('marca', 'is', null),
    supabase.from('clientes').select('genero, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis').eq('user_id', user.id),
  ])

  const marcas = [...new Set((rows ?? []).map(r => r.marca as string).filter(Boolean))].sort()

  // Gênero
  const total = clientes?.length ?? 0
  const generoM   = clientes?.filter(c => c.genero === 'M').length ?? 0
  const generoF   = clientes?.filter(c => c.genero === 'F').length ?? 0
  const generoSem = total - generoM - generoF

  // Faixa etária
  const hoje = new Date()
  const faixaMap: Record<string, number> = {}
  let semNasc = 0
  for (const c of clientes ?? []) {
    if (!c.data_nascimento) { semNasc++; continue }
    const nasc = new Date(c.data_nascimento)
    const age = hoje.getFullYear() - nasc.getFullYear() -
      (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate()) ? 1 : 0)
    const faixa = age < 18 ? '<18' : age < 25 ? '18–24' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : '55+'
    faixaMap[faixa] = (faixaMap[faixa] ?? 0) + 1
  }
  const faixaEtaria = ['<18', '18–24', '25–34', '35–44', '45–54', '55+']
    .map(label => ({ label, count: faixaMap[label] ?? 0 }))

  // Tamanhos
  function contarTamanhos(field: 'tamanho_camiseta' | 'tamanho_calca' | 'tamanho_tenis') {
    const counts: Record<string, number> = {}
    for (const c of clientes ?? []) {
      const t = c[field]; if (!t) continue
      counts[t] = (counts[t] ?? 0) + 1
    }
    const tot = Object.values(counts).reduce((a, b) => a + b, 0)
    return Object.entries(counts)
      .map(([tamanho, count]) => ({ tamanho, count, pct: tot ? Math.round(count / tot * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  }

  const publico = {
    total,
    genero: { M: generoM, F: generoF, sem: generoSem },
    faixaEtaria,
    semNasc,
    camiseta: contarTamanhos('tamanho_camiseta'),
    calca:    contarTamanhos('tamanho_calca'),
    tenis:    contarTamanhos('tamanho_tenis'),
  }

  return <ComprasClient marcas={marcas} publico={publico} />
}
