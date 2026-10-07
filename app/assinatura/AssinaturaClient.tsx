'use client'

import { useState } from 'react'
import { PLANOS, type PlanoId, type StatusResumo } from '@/lib/assinatura'

export default function AssinaturaClient({
  planoAtual, status, resumo,
}: {
  planoAtual: PlanoId | null
  status: string
  resumo: StatusResumo
}) {
  const [carregando, setCarregando] = useState<PlanoId | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function assinar(plano: PlanoId) {
    setCarregando(plano); setMsg(null)
    try {
      const res = await fetch('/api/assinatura/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plano }),
      })
      const d = await res.json()
      if (d.ok && d.url) { window.location.href = d.url; return }
      setMsg(d.erro ?? 'Não consegui iniciar a assinatura.')
    } catch {
      setMsg('Erro de conexão. Tente de novo.')
    } finally {
      setCarregando(null)
    }
  }

  const corStatus = resumo.ativo ? 'text-[#00D4AA] border-[#00D4AA]/30 bg-[#00D4AA]/10'
    : 'text-amber-300 border-amber-500/30 bg-amber-500/10'

  return (
    <main className="min-h-screen bg-[#09090b] text-white px-4 sm:px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Assinatura</h1>
        <p className="text-sm text-zinc-400 mt-1">Escolha o plano do Terny pra sua loja.</p>

        <div className={`mt-4 inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-1.5 border ${corStatus}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" /> {resumo.rotulo}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {(Object.keys(PLANOS) as PlanoId[]).map(id => {
            const p = PLANOS[id]
            const atual = planoAtual === id && status === 'ativa'
            const destaque = id === 'pro'
            return (
              <div key={id} className={`rounded-2xl border p-6 flex flex-col ${destaque ? 'border-[#C79A54]/40 bg-gradient-to-b from-[#C79A54]/10 to-transparent' : 'border-zinc-800 bg-zinc-900/50'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{p.nome}</h2>
                  {atual && <span className="text-[11px] font-bold text-[#00D4AA] bg-[#00D4AA]/15 rounded-full px-2 py-0.5">Seu plano</span>}
                </div>
                <div className="flex items-end gap-1 mt-2 mb-3">
                  <span className="text-sm text-zinc-500 mb-1">R$</span>
                  <span className="text-4xl font-extrabold tracking-tight">{p.preco}</span>
                  <span className="text-sm text-zinc-500 mb-1">/mês</span>
                </div>
                <p className="text-sm text-zinc-400 flex-1">{p.descricao}</p>
                <button
                  onClick={() => assinar(id)}
                  disabled={carregando !== null || atual}
                  className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50 ${destaque ? 'bg-[#C79A54] hover:bg-[#B98C46] text-[#16151A]' : 'bg-white/10 hover:bg-white/15 text-white'}`}
                >
                  {atual ? 'Plano atual' : carregando === id ? 'Abrindo…' : `Assinar ${p.nome}`}
                </button>
              </div>
            )
          })}
        </div>

        {msg && (
          <p className="mt-5 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">{msg}</p>
        )}

        <p className="text-xs text-zinc-600 mt-6">Pagamento mensal, cancele quando quiser. O custo das mensagens do WhatsApp (Meta) pode ser à parte dependendo do plano.</p>
      </div>
    </main>
  )
}
