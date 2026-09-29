import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { ehFundador } from '@/lib/fundador'

export const metadata: Metadata = { title: 'Admin · Erros — Terny', robots: 'noindex, nofollow' }

type ErroRow = {
  id: string
  user_id: string | null
  rota: string | null
  mensagem: string | null
  contexto: Record<string, unknown> | null
  criado_em: string
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminErrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Canal do fundador — só o email do dono do Terny entra. Lojas caem no dashboard.
  if (!ehFundador(user.email)) redirect('/dashboard')

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data } = await admin
    .from('app_erros')
    .select('id, user_id, rota, mensagem, contexto, criado_em')
    .order('criado_em', { ascending: false })
    .limit(200)
  const erros = (data ?? []) as ErroRow[]

  // Nome da loja por user_id
  const ids = [...new Set(erros.map(e => e.user_id).filter(Boolean))] as string[]
  const nomePorUser: Record<string, string> = {}
  if (ids.length) {
    const { data: lojas } = await admin.from('loja_config').select('user_id, nome_loja').in('user_id', ids)
    for (const l of (lojas ?? []) as { user_id: string; nome_loja: string | null }[]) {
      nomePorUser[l.user_id] = l.nome_loja || l.user_id.slice(0, 8)
    }
  }

  // Contagem por loja (visão rápida de quem está com mais problema)
  const contagem: Record<string, number> = {}
  for (const e of erros) {
    const k = e.user_id ? (nomePorUser[e.user_id] ?? e.user_id.slice(0, 8)) : 'Sistema'
    contagem[k] = (contagem[k] ?? 0) + 1
  }
  const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen bg-[#080B10] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C79A54]/30 bg-[#C79A54]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#F0CC88] mb-2">
            Canal do fundador
          </div>
          <h1 className="text-xl font-bold text-white">Erros — todas as lojas</h1>
          <p className="text-sm text-zinc-500 mt-1">Visão central de suporte. Cada loja continua vendo só os erros dela.</p>
        </div>

        {ranking.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ranking.map(([loja, n]) => (
              <span key={loja} className="text-xs bg-zinc-900/60 border border-zinc-800 rounded-full px-3 py-1 text-zinc-300">
                {loja} <span className="text-zinc-500">· {n}</span>
              </span>
            ))}
          </div>
        )}

        {erros.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-10 text-center text-zinc-400">
            Nenhum erro em nenhuma loja. Tudo saudável. 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {erros.map(e => (
              <div key={e.id} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold text-emerald-300 shrink-0">{e.user_id ? (nomePorUser[e.user_id] ?? e.user_id.slice(0, 8)) : 'Sistema'}</span>
                    <span className="text-xs font-mono font-semibold text-[#E0B36A] truncate">{e.rota ?? '—'}</span>
                  </div>
                  <span className="text-[11px] text-zinc-500 shrink-0">{fmt(e.criado_em)}</span>
                </div>
                <p className="text-sm text-zinc-200 break-words">{e.mensagem ?? '(sem mensagem)'}</p>
                {e.contexto && Object.keys(e.contexto).length > 0 && (
                  <pre className="mt-2 text-[11px] text-zinc-500 bg-black/30 rounded-lg p-2 overflow-x-auto">{JSON.stringify(e.contexto)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
