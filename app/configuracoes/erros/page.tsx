import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Erros do sistema — Terny' }

type ErroRow = {
  id: string
  rota: string | null
  mensagem: string | null
  contexto: Record<string, unknown> | null
  criado_em: string
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default async function ErrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS deixa o dono ver os próprios erros + os de sistema (user_id nulo)
  const { data } = await supabase
    .from('app_erros')
    .select('id, rota, mensagem, contexto, criado_em')
    .order('criado_em', { ascending: false })
    .limit(100)

  const erros = (data ?? []) as ErroRow[]

  return (
    <div className="min-h-screen bg-[#080B10] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white">Erros do sistema</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Quando algo falha no servidor, fica registrado aqui pra você ter visibilidade. Vazio é sinal de saúde. 🟢
          </p>
        </div>

        {erros.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-10 text-center text-zinc-400">
            Nenhum erro registrado. Tudo rodando liso. 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {erros.map(e => (
              <div key={e.id} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono font-semibold text-violet-300">{e.rota ?? '—'}</span>
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
