'use client'

import { useState } from 'react'

type Sugestao = {
  id: string
  tipo: string
  titulo: string
  descricao: string
  prioridade: number
  status: string
  acao: {
    tipo: string
    clientes?: string[]
    sugestao_mensagem?: string
  } | null
  created_at: string
}

const TIPO_CONFIG: Record<string, { emoji: string; cor: string }> = {
  vip:            { emoji: '👑', cor: 'border-yellow-500/40 bg-yellow-500/5' },
  brinde:         { emoji: '🎁', cor: 'border-yellow-500/40 bg-yellow-500/5' },
  reativacao:     { emoji: '🔥', cor: 'border-red-500/40 bg-red-500/5' },
  campanha:       { emoji: '🎯', cor: 'border-blue-500/40 bg-blue-500/5' },
  cross_sell:     { emoji: '🔗', cor: 'border-purple-500/40 bg-purple-500/5' },
  tendencia:      { emoji: '📈', cor: 'border-green-500/40 bg-green-500/5' },
  oportunidade:   { emoji: '💡', cor: 'border-zinc-500/40 bg-zinc-800/40' },
}

export default function InteligenciaClient({ sugestoes: inicial, userId }: { sugestoes: Sugestao[]; userId: string }) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>(inicial)
  const [rodando, setRodando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  async function rodarInteligencia() {
    setRodando(true)
    try {
      await fetch('/api/cron/inteligencia')
      window.location.reload()
    } catch {
      setRodando(false)
    }
  }

  async function resolverSugestao(id: string, status: 'resolvida' | 'ignorada') {
    await fetch(`/api/inteligencia/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setSugestoes(s => s.filter(x => x.id !== id))
  }

  const pendentes = sugestoes.filter(s => s.status === 'pendente')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Inteligência</h1>
            <p className="text-sm text-zinc-500 mt-1">Sugestões geradas pelos agentes com base nos dados da loja</p>
          </div>
          <button
            onClick={rodarInteligencia}
            disabled={rodando}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {rodando ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Analisando...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                  <path d="M16 16h5v5"/>
                </svg>
                Analisar agora
              </>
            )}
          </button>
        </div>

        {/* Sugestões */}
        {pendentes.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <div className="text-5xl mb-4">🤖</div>
            <p className="text-lg font-medium text-zinc-400">Nenhuma sugestão pendente</p>
            <p className="text-sm mt-2">Clique em "Analisar agora" para os agentes varrerem os dados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendentes.map(s => {
              const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.oportunidade
              const aberta = expandida === s.id
              return (
                <div key={s.id} className={`border rounded-xl overflow-hidden transition-all ${cfg.cor}`}>
                  <button
                    className="w-full text-left px-5 py-4 flex items-start gap-3"
                    onClick={() => setExpandida(aberta ? null : s.id)}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-zinc-100">{s.titulo}</p>
                      <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{s.descricao}</p>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 mt-1 text-zinc-500 transition-transform ${aberta ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {aberta && (
                    <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                      <p className="text-sm text-zinc-300 leading-relaxed">{s.descricao}</p>

                      {s.acao?.clientes && s.acao.clientes.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Clientes envolvidos</p>
                          <div className="flex flex-wrap gap-2">
                            {s.acao.clientes.map(c => (
                              <span key={c} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {s.acao?.sugestao_mensagem && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Sugestão de mensagem</p>
                          <p className="text-sm text-zinc-300 bg-zinc-800/60 rounded-lg px-4 py-3 italic">
                            "{s.acao.sugestao_mensagem}"
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => resolverSugestao(s.id, 'resolvida')}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
                        >
                          ✓ Executar
                        </button>
                        <button
                          onClick={() => resolverSugestao(s.id, 'ignorada')}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
