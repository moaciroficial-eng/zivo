'use client'

import { useState, useRef } from 'react'

/* ── Types ── */

export type SaudeDados = {
  dividas: number
  despesas_fixas: number
  capital_de_giro: number
  situacao_financeira: 'risco' | 'estavel' | 'saudavel' | null
}

type Props = {
  current: Partial<SaudeDados> & { situacao_financeira?: string | null } | null
  onClose: () => void
  onSave: (dados: SaudeDados) => Promise<void>
}

/* ── BRL helpers ── */

function formatBRL(raw: string): string {
  if (!raw) return ''
  const parts = raw.split(',')
  const intDigits = parts[0].replace(/\D/g, '')
  const decPart = parts.length > 1 ? ',' + parts[1] : ''
  if (!intDigits) return decPart ? '0' + decPart : ''
  return parseInt(intDigits, 10).toLocaleString('pt-BR') + decPart
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function handleBRLChange(setter: (v: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = e.target.value.replace(/\./g, '')
    const onlyValid = stripped.replace(/[^\d,]/g, '')
    const parts = onlyValid.split(',')
    setter(parts[0] + (parts.length > 1 ? ',' + parts[1].slice(0, 2) : ''))
  }
}

function deriveSituacao(d: number, df: number, cg: number): 'risco' | 'estavel' | 'saudavel' {
  let score = 0
  if (cg >= df * 2) score += 2; else if (cg >= df) score += 1; else score -= 1
  if (d === 0) score += 2; else if (d < cg * 0.3) score += 1; else if (d >= cg) score -= 2
  return score >= 3 ? 'saudavel' : score >= 0 ? 'estavel' : 'risco'
}

/* ── Icons ── */

const IconRisco = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

const IconEstavel = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
)

const IconSaudavel = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
    <polyline points="20 6 9 18 4 13"/>
  </svg>
)

const IconChevron = ({ open }: { open: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform ${open ? 'rotate-180' : ''}`}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

/* ── Presets ── */

const PRESETS: {
  value: 'risco' | 'estavel' | 'saudavel'
  label: string
  tagline: string
  desc: string
  icon: React.ReactNode
  dot: string
  ring: string
  textColor: string
}[] = [
  {
    value: 'risco',
    label: 'Em risco',
    tagline: 'Afogado / no vermelho',
    desc: 'Dívidas em aberto, caixa baixo ou mês difícil de fechar. Plano vai priorizar margem e evitar descontos.',
    icon: <IconRisco />,
    dot: 'bg-red-400',
    ring: 'border-red-500/50 bg-red-500/8',
    textColor: 'text-red-400',
  },
  {
    value: 'estavel',
    label: 'Estável',
    tagline: 'Empatando / equilibrado',
    desc: 'Pagando as contas em dia, mas sem muita sobra. Plano equilibrado com descontos moderados.',
    icon: <IconEstavel />,
    dot: 'bg-amber-400',
    ring: 'border-amber-500/50 bg-amber-500/8',
    textColor: 'text-amber-400',
  },
  {
    value: 'saudavel',
    label: 'Saudável',
    tagline: 'Tranquilo / sobrando',
    desc: 'Caixa positivo e dívidas sob controle. Plano pode usar descontos estratégicos quando necessário.',
    icon: <IconSaudavel />,
    dot: 'bg-emerald-400',
    ring: 'border-emerald-500/50 bg-emerald-500/8',
    textColor: 'text-emerald-400',
  },
]

/* ── NumericField ── */

function NumericField({ label, hint, value, onChange, autoFocus }: {
  label: string; hint: string; value: string
  onChange: (v: string) => void; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">R$</span>
        <input
          type="text" inputMode="numeric" autoFocus={autoFocus}
          value={formatBRL(value)}
          onChange={handleBRLChange(onChange)}
          placeholder="0"
          className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
      </div>
      <p className="text-xs text-zinc-600 mt-1">{hint}</p>
    </div>
  )
}

/* ── Main component ── */

export default function SaudeFinanceiraModal({ current, onClose, onSave }: Props) {
  const hasDetailed = !!(current?.despesas_fixas && current.despesas_fixas > 0)

  const [preset, setPreset] = useState<'risco' | 'estavel' | 'saudavel' | null>(
    (current?.situacao_financeira as 'risco' | 'estavel' | 'saudavel' | null) ?? null
  )
  const [showDetailed, setShowDetailed] = useState(hasDetailed && !current?.situacao_financeira)
  const [dividas,  setDividas]  = useState(hasDetailed && current?.dividas  ? String(current.dividas)         : '')
  const [despesas, setDespesas] = useState(hasDetailed && current?.despesas_fixas ? String(current.despesas_fixas) : '')
  const [capital,  setCapital]  = useState(hasDetailed && current?.capital_de_giro ? String(current.capital_de_giro) : '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const canSave = !!(preset || (showDetailed && despesas))

  async function handleSubmit() {
    if (!canSave) { setError('Selecione uma situação ou informe os dados detalhados.'); return }
    if (showDetailed && !despesas) { setError('Informe as despesas fixas mensais.'); return }
    setSaving(true); setError(null)
    try {
      let finalPreset = preset
      const d  = parseBRL(dividas)
      const df = parseBRL(despesas)
      const cg = parseBRL(capital)
      if (showDetailed && df > 0) finalPreset = deriveSituacao(d, df, cg)

      await onSave({
        dividas:             showDetailed ? d  : 0,
        despesas_fixas:      showDetailed ? df : 0,
        capital_de_giro:     showDetailed ? cg : 0,
        situacao_financeira: finalPreset,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-bold">Como está sua empresa?</h2>
          <p className="text-sm text-zinc-400 mt-1">A IA calibra o plano com base na sua situação — margens, descontos e urgência.</p>
        </div>

        {/* 3 presets */}
        <div className="flex flex-col gap-2 mb-4">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(prev => prev === p.value ? null : p.value)}
              className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition cursor-pointer w-full ${
                preset === p.value ? p.ring : 'border-zinc-700/70 bg-zinc-800/30 hover:border-zinc-600'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} />
                  <span className="font-semibold text-sm">{p.label}</span>
                  <span className="text-xs text-zinc-500">{p.tagline}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{p.desc}</p>
              </div>
              {preset === p.value && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-1 ${p.textColor}`}>
                  <polyline points="20 6 9 18 4 13"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Detailed toggle */}
        <button
          type="button"
          onClick={() => setShowDetailed(s => !s)}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-400 transition cursor-pointer mb-3 w-full"
        >
          <IconChevron open={showDetailed} />
          {showDetailed ? 'Ocultar dados detalhados' : 'Informar dados detalhados (opcional)'}
        </button>

        {showDetailed && (
          <div className="flex flex-col gap-4 mb-4 bg-zinc-800/30 border border-zinc-700/50 rounded-2xl p-4">
            <p className="text-xs text-zinc-500">Com dados reais a IA calcula ponto de equilíbrio, cobertura de caixa e margem líquida.</p>
            <NumericField
              label="Despesas fixas mensais *"
              hint="Aluguel, salários, contas, sistema, contador…"
              value={despesas} onChange={setDespesas} autoFocus
            />
            <NumericField
              label="Dívidas atuais"
              hint="Empréstimos, cheque especial, fornecedores em atraso. Deixe 0 se não houver."
              value={dividas} onChange={setDividas}
            />
            <NumericField
              label="Capital de giro disponível"
              hint="Dinheiro em caixa / conta corrente disponível para operar."
              value={capital} onChange={setCapital}
            />
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {/* Footer */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-sm font-medium transition cursor-pointer">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit}
            disabled={saving || !canSave}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition cursor-pointer">
            {saving ? 'Salvando…' : 'Salvar e recalcular'}
          </button>
        </div>
      </div>
    </div>
  )
}
