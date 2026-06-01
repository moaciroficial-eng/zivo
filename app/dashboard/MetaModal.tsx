'use client'

import { useState, useEffect, useRef } from 'react'

type Props = {
  mes: string
  currentMeta: number | null
  onClose: () => void
  onSave: (valor: number) => Promise<void>
}

const LABEL_MES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio',    '06': 'Junho',     '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro','10': 'Outubro',   '11': 'Novembro','12': 'Dezembro',
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  return `${LABEL_MES[m] ?? m} ${y}`
}

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

export default function MetaModal({ mes, currentMeta, onClose, onSave }: Props) {
  const [valor, setValor] = useState(currentMeta != null ? String(currentMeta) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = parseBRL(valor)
    if (isNaN(num) || num <= 0) {
      setError('Informe um valor válido maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(num)
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-bold mb-1">
          {currentMeta != null ? 'Editar' : 'Definir'} meta de faturamento
        </h2>
        <p className="text-sm text-zinc-400 mb-5">{formatMes(mes)}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Meta mensal (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">R$</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={formatBRL(valor)}
                onChange={handleBRLChange(setValor)}
                placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
          </div>

          <p className="text-xs text-zinc-500">
            A IA vai gerar um plano diário com produtos a priorizar e clientes a contatar para atingir essa meta.
            O plano é atualizado automaticamente conforme as vendas são registradas.
          </p>

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
              disabled={saving || !valor}
              className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition cursor-pointer"
            >
              {saving ? 'Gerando plano…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
