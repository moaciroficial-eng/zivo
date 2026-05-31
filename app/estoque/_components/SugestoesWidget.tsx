'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Produto } from '../types'

type Sugestao = {
  id: string
  produto_id: string
  produto_nome: string
  tipo: 'categoria_incorreta' | 'custo_faltando' | 'preco_anomalia'
  descricao: string
  campo: string | null
  valor_sugerido: string | null
}

const IGNORED_KEY = 'sugestoes_ignoradas'

const TIPO_LABEL: Record<Sugestao['tipo'], string> = {
  categoria_incorreta: 'Categoria',
  custo_faltando:      'Custo',
  preco_anomalia:      'Preço',
}

const TIPO_COLOR: Record<Sugestao['tipo'], string> = {
  categoria_incorreta: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  custo_faltando:      'bg-amber-500/15 text-amber-300 border-amber-500/25',
  preco_anomalia:      'bg-red-500/15 text-red-300 border-red-500/25',
}

const IconSparkle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.88 5.76a1 1 0 0 0 .95.69H21l-4.94 3.59a1 1 0 0 0-.36 1.12L17.58 20 12 16.41 6.42 20l1.88-5.84a1 1 0 0 0-.36-1.12L3 9.45h6.17a1 1 0 0 0 .95-.69z"/>
  </svg>
)

const IconCheck  = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconX      = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconEdit   = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconSpinner = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>

function loadIgnoradas(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveIgnoradas(set: Set<string>) {
  try { localStorage.setItem(IGNORED_KEY, JSON.stringify([...set])) } catch {}
}

export default function SugestoesWidget({
  produtos,
  onProdutoUpdate,
}: {
  produtos: Produto[]
  onProdutoUpdate: (id: string, patch: Partial<Produto>) => void
}) {
  const supabase = createClient()
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [ignoradas, setIgnoradas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [analisado, setAnalisado] = useState(false)
  const [aplicando, setAplicando] = useState<string | null>(null)

  useEffect(() => { setIgnoradas(loadIgnoradas()) }, [])

  const visiveis = sugestoes.filter(s => !ignoradas.has(s.id))

  async function analisar() {
    setLoading(true)
    setAnalisado(false)
    try {
      const res = await fetch('/api/sugestoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Sugestao[] = await res.json()
      // filtra as já ignoradas
      const ignoradasAtual = loadIgnoradas()
      setSugestoes(data.filter(s => !ignoradasAtual.has(s.id)))
      setIgnoradas(ignoradasAtual)
    } catch { /* falha silenciosa — botão fica disponível para retry */ }
    finally { setLoading(false); setAnalisado(true) }
  }

  function ignorar(id: string) {
    const novo = new Set(ignoradas).add(id)
    setIgnoradas(novo)
    saveIgnoradas(novo)
  }

  async function aplicar(s: Sugestao) {
    if (!s.campo || s.valor_sugerido === null) return
    setAplicando(s.id)
    const patch = { [s.campo]: s.valor_sugerido }
    const { error } = await supabase.from('estoque').update(patch).eq('id', s.produto_id)
    if (!error) {
      onProdutoUpdate(s.produto_id, patch as Partial<Produto>)
      ignorar(s.id)
    }
    setAplicando(null)
  }

  const podeAplicar = (s: Sugestao) => s.campo !== null && s.valor_sugerido !== null

  // Estado compacto antes de analisar
  if (!analisado && !loading) {
    return (
      <button
        onClick={analisar}
        className="mb-5 flex items-center gap-2 text-sm text-violet-300 bg-violet-500/8 hover:bg-violet-500/15 border border-violet-500/20 hover:border-violet-500/35 rounded-xl px-4 py-2.5 transition cursor-pointer w-full"
      >
        <span className="flex items-center gap-1.5 text-violet-400">
          <IconSparkle />
          <span className="font-semibold text-xs uppercase tracking-wider">IA</span>
        </span>
        <span className="text-zinc-400">Analisar estoque e sugerir correções</span>
        <span className="ml-auto text-zinc-600 text-xs">{produtos.length} produto{produtos.length !== 1 ? 's' : ''}</span>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="mb-5 flex items-center gap-3 text-sm text-violet-300 bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-3">
        <IconSpinner />
        Analisando {produtos.length} produtos com IA...
      </div>
    )
  }

  // Após análise
  return (
    <div className="mb-5">
      {visiveis.length === 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <IconCheck />
            <span>Nenhum problema encontrado nos produtos.</span>
          </div>
          <button
            onClick={analisar}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
          >
            Reanalisar
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-violet-400">
                <IconSparkle />
                <span className="text-xs font-semibold uppercase tracking-wider">Sugestões IA</span>
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-violet-500/15 text-violet-300 border border-violet-500/25 rounded-full">
                {visiveis.length}
              </span>
            </div>
            <button
              onClick={analisar}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
            >
              Reanalisar
            </button>
          </div>

          {/* Sugestões */}
          <ul className="divide-y divide-zinc-800/60">
            {visiveis.map(s => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                {/* Badge tipo */}
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 border rounded-md ${TIPO_COLOR[s.tipo]}`}>
                  {TIPO_LABEL[s.tipo]}
                </span>

                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.produto_nome}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{s.descricao}</p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {podeAplicar(s) ? (
                    <button
                      onClick={() => aplicar(s)}
                      disabled={aplicando === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition cursor-pointer"
                    >
                      {aplicando === s.id ? <IconSpinner /> : <IconCheck />}
                      Aplicar
                    </button>
                  ) : (
                    <Link
                      href={`/estoque/${s.produto_id}/editar`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition"
                    >
                      <IconEdit />
                      Editar
                    </Link>
                  )}
                  <button
                    onClick={() => ignorar(s.id)}
                    title="Ignorar sugestão"
                    className="p-1.5 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                  >
                    <IconX />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
