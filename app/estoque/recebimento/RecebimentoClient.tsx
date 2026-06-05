'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { NfeGrupoMeta } from '../types'

type ProdutoPendente = {
  id: string
  nome: string
  marca: string | null
  nfe_grupo_id: string
  created_at: string
}

type GrupoPendente = {
  grupoId: string
  emitente: string | null
  num_nfe: string | null
  total_itens: number
  data: string
  meta?: NfeGrupoMeta
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const IconBox = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
  </svg>
)

const IconArrow = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
  </svg>
)

const IconBack = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

export default function RecebimentoClient({
  user,
  produtosPendentes,
}: {
  user: { id: string; email: string }
  produtosPendentes: ProdutoPendente[]
}) {
  const [grupos, setGrupos] = useState<GrupoPendente[]>([])

  useEffect(() => {
    // Agrupa produtos por nfe_grupo_id
    const map = new Map<string, ProdutoPendente[]>()
    for (const p of produtosPendentes) {
      const arr = map.get(p.nfe_grupo_id) ?? []
      arr.push(p)
      map.set(p.nfe_grupo_id, arr)
    }

    const result: GrupoPendente[] = []
    for (const [grupoId, prods] of map) {
      let meta: NfeGrupoMeta | undefined
      try {
        const raw = localStorage.getItem(`nfe_grupo_${grupoId}`)
        if (raw) meta = JSON.parse(raw)
      } catch { /* ignore */ }

      result.push({
        grupoId,
        emitente: meta?.emitente ?? prods[0].marca,
        num_nfe:  meta?.num_nfe  ?? null,
        total_itens: prods.length,
        data: meta?.data ?? prods[0].created_at,
        meta,
      })
    }

    // Ordena por data decrescente
    result.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    setGrupos(result)
  }, [produtosPendentes])

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <main className="max-w-4xl mx-auto px-6 py-8">

        {/* Title */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/estoque" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">
            <IconBack />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Conferência de Recebimento</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {grupos.length === 0
                ? 'Nenhuma NF-e aguardando conferência'
                : `${grupos.length} NF-e${grupos.length !== 1 ? 's' : ''} aguardando conferência`}
            </p>
          </div>
        </div>

        {grupos.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
              <IconBox />
            </div>
            <p className="font-medium text-zinc-300">Nenhuma conferência pendente</p>
            <p className="text-zinc-500 text-sm">Importe uma NF-e pelo Estoque para iniciar a conferência.</p>
            <Link href="/estoque" className="mt-2 text-sm font-semibold text-violet-400 hover:text-violet-300 transition">
              Ir para Estoque →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grupos.map(grupo => (
              <Link
                key={grupo.grupoId}
                href={`/estoque/recebimento/${grupo.grupoId}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-5 transition group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                      <IconBox />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{grupo.emitente ?? 'Emitente desconhecido'}</p>
                        {grupo.num_nfe && (
                          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded font-mono shrink-0">
                            NF {grupo.num_nfe}
                          </span>
                        )}
                        <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded shrink-0">
                          Aguardando conferência
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {grupo.total_itens} produto{grupo.total_itens !== 1 ? 's' : ''} · {formatDate(grupo.data)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-500 group-hover:text-white transition shrink-0">
                    <span className="text-sm hidden sm:block">Conferir</span>
                    <IconArrow />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
