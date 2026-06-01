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
    const num = parseFloat(valor.replace(',', '.'))
    if (isNaN(num) || num <= 0) {
      setError('Informe um valor válido maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(num)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
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
                type="number"
                min="1"
                step="0.01"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]"
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
