'use client'

import { useState, useEffect, useRef } from 'react'

export type SaudeDados = {
  dividas: number
  despesas_fixas: number
  capital_de_giro: number
}

type Props = {
  current: SaudeDados | null
  onClose: () => void
  onSave: (dados: SaudeDados) => Promise<void>
}

const INPUT_CLASS = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'

// raw: digits + optional comma + up to 2 digits (e.g. "5000" or "500,50")
// returns formatted display string (e.g. "5.000" or "500,50")
function formatBRL(raw: string): string {
  if (!raw) return ''
  const parts = raw.split(',')
  const intDigits = parts[0].replace(/\D/g, '')
  const decPart = parts.length > 1 ? ',' + parts[1] : ''
  if (!intDigits) return decPart ? '0' + decPart : ''
  const intFormatted = parseInt(intDigits, 10).toLocaleString('pt-BR')
  return intFormatted + decPart
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function handleBRLChange(setter: (v: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = e.target.value.replace(/\./g, '') // remove thousands dots
    const onlyValid = stripped.replace(/[^\d,]/g, '')
    const parts = onlyValid.split(',')
    const intPart = parts[0]
    const decPart = parts.length > 1 ? ',' + parts[1].slice(0, 2) : ''
    setter(intPart + decPart)
  }
}

function NumericField({
  label, hint, value, onChange, inputRef,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">R$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={formatBRL(value)}
          onChange={handleBRLChange(onChange)}
          placeholder="0"
          className={INPUT_CLASS}
        />
      </div>
      <p className="text-xs text-zinc-600 mt-1">{hint}</p>
    </div>
  )
}

export default function SaudeFinanceiraModal({ current, onClose, onSave }: Props) {
  const [dividas,  setDividas]  = useState(current?.dividas        != null ? String(current.dividas)        : '')
  const [despesas, setDespesas] = useState(current?.despesas_fixas != null ? String(current.despesas_fixas) : '')
  const [capital,  setCapital]  = useState(current?.capital_de_giro != null ? String(current.capital_de_giro) : '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const d  = parseBRL(dividas)
    const df = parseBRL(despesas)
    const cg = parseBRL(capital)

    if (!df || df <= 0) {
      setError('Informe as despesas fixas mensais.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ dividas: d, despesas_fixas: df, capital_de_giro: cg })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="mb-5">
          <h2 className="text-lg font-bold">Saúde financeira da empresa</h2>
          <p className="text-sm text-zinc-400 mt-1">
            A IA usa esses dados para criar um plano equilibrado — nunca sugerindo vendas abaixo do custo ou descontos que comprometam o caixa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <NumericField
            label="Despesas fixas mensais *"
            hint="Aluguel, salários, contas, sistema, contador…"
            value={despesas}
            onChange={setDespesas}
            inputRef={firstRef}
          />
          <NumericField
            label="Dívidas atuais"
            hint="Total de empréstimos, cheque especial, fornecedores em atraso. Deixe 0 se não houver."
            value={dividas}
            onChange={setDividas}
          />
          <NumericField
            label="Capital de giro disponível"
            hint="Dinheiro em caixa / conta corrente disponível para operar."
            value={capital}
            onChange={setCapital}
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 text-xs text-zinc-500 space-y-1">
            <p className="font-semibold text-zinc-400">Como a IA usa esses dados:</p>
            <p>• Empresa com dívidas → plano equilibrado, margem mínima protegida</p>
            <p>• Capital de giro baixo → evita sugerir promoções agressivas</p>
            <p>• Nunca sugere vender abaixo do custo de compra</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-sm font-medium transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !despesas}
              className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition cursor-pointer"
            >
              {saving ? 'Salvando…' : 'Salvar e recalcular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
