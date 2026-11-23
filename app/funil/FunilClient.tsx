'use client'

import { useState, useMemo } from 'react'

type Qualificacao = {
  id: string
  contato_id: string
  status: string
  origem: string | null
  iniciado_at: string
  fotos_enviadas: boolean
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'tudo'

function origemLabel(o: string | null): string {
  return o === 'live' ? 'Live' : o === 'campanha' ? 'Campanha' : o === 'organico' ? 'Orgânico' : 'Sem origem'
}

function pct(n: number, base: number): string {
  if (base === 0) return '—'
  return `${Math.round((n / base) * 100)}%`
}

export default function FunilClient({ qualificacoes, clientePorContato, clientesComVenda }: {
  qualificacoes: Qualificacao[]
  clientePorContato: Record<string, string>
  clientesComVenda: string[]
}) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [origemFiltro, setOrigemFiltro] = useState<string>('todas')

  const clientesComVendaSet = useMemo(() => new Set(clientesComVenda), [clientesComVenda])

  const filtradas = useMemo(() => {
    const agora = Date.now()
    const limiteMs = periodo === 'hoje' ? 24 * 60 * 60 * 1000
      : periodo === 'semana' ? 7 * 24 * 60 * 60 * 1000
      : periodo === 'mes' ? 30 * 24 * 60 * 60 * 1000
      : null
    return qualificacoes.filter(q => {
      if (limiteMs != null && agora - new Date(q.iniciado_at).getTime() > limiteMs) return false
      if (origemFiltro !== 'todas' && (q.origem ?? 'sem_origem') !== origemFiltro) return false
      return true
    })
  }, [qualificacoes, periodo, origemFiltro])

  const chegou = filtradas.length
  const respondeuTodas = filtradas.filter(q => q.status === 'concluido').length
  const recebeuFotos = filtradas.filter(q => q.status === 'concluido' && q.fotos_enviadas).length
  const comprou = filtradas.filter(q => {
    const clienteId = clientePorContato[q.contato_id]
    return clienteId && clientesComVendaSet.has(clienteId)
  }).length

  const etapas = [
    { label: 'Chegou', valor: chegou, emoji: '👋' },
    { label: 'Respondeu as 3 perguntas', valor: respondeuTodas, emoji: '✅' },
    { label: 'Recebeu fotos', valor: recebeuFotos, emoji: '📸' },
    { label: 'Comprou', valor: comprou, emoji: '🛍️' },
  ]

  const origensPresentes = [...new Set(qualificacoes.map(q => q.origem ?? 'sem_origem'))]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
      <h1 className="text-lg font-bold mb-1">Funil da qualificação</h1>
      <p className="text-sm text-zinc-500 mb-5">Chegou → respondeu as 3 perguntas → recebeu fotos → comprou.</p>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {([
          { key: 'hoje' as Periodo, label: 'Hoje' },
          { key: 'semana' as Periodo, label: 'Esta semana' },
          { key: 'mes' as Periodo, label: 'Este mês' },
          { key: 'tudo' as Periodo, label: 'Tudo' },
        ]).map(({ key, label }) => (
          <button key={key} onClick={() => setPeriodo(key)}
            className={`text-sm px-3.5 py-1.5 rounded-lg font-medium transition ${periodo === key ? 'bg-[#C79A54] text-[#16151A]' : 'text-zinc-400 bg-zinc-800 hover:text-white border border-zinc-700 hover:border-zinc-500'}`}>
            {label}
          </button>
        ))}
        <span className="text-zinc-700 hidden sm:block select-none">|</span>
        <select value={origemFiltro} onChange={e => setOrigemFiltro(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-[#C79A54] [color-scheme:dark]">
          <option value="todas">Todas as origens</option>
          {origensPresentes.map(o => <option key={o} value={o}>{origemLabel(o === 'sem_origem' ? null : o)}</option>)}
        </select>
      </div>

      {chegou === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-16">Nenhuma qualificação iniciada nesse período.</p>
      ) : (
        <div className="space-y-2.5">
          {etapas.map((e, i) => {
            const base = etapas[0].valor
            const anterior = i > 0 ? etapas[i - 1].valor : null
            return (
              <div key={e.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">{e.emoji} {e.label}</span>
                  <span className="text-lg font-bold text-[#C79A54]">{e.valor}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#C79A54] to-[#E0B36A] rounded-full transition-all" style={{ width: `${base > 0 ? (e.valor / base) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  {pct(e.valor, base)} do total{anterior != null && anterior > 0 ? ` · ${pct(e.valor, anterior)} de quem chegou na etapa anterior` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
