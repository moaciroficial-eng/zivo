'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ProdutoFiscal = {
  id: string
  nome: string
  marca: string | null
  categoria: string | null
  ncm: string | null
  status: string | null
}

/* NCM padrão por categoria (aproximado — refinar com a contabilidade) */
const NCM_CAT: Record<string, string> = {
  tenis: '64039990', chinelo: '64022000',
  camiseta: '61091000', regata: '61091000', polo: '61051000', blusa: '61061000',
  camisa: '62052000', calca: '62034200', bermuda: '62034300',
  cueca: '61071100', meia: '61159500', bone: '65050090', acessorios: '62179000',
}
const ncmValido = (n: string | null | undefined) => /^\d{8}$/.test((n ?? '').replace(/\D/g, ''))

export default function SaudeFiscalClient({ user, produtos: init }: { user: { id: string }; produtos: ProdutoFiscal[] }) {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<ProdutoFiscal[]>(init)
  const [toast, setToast] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  function aviso(m: string) { setToast(m); setTimeout(() => setToast(null), 2500) }

  const semNcm = useMemo(() => produtos.filter(p => !ncmValido(p.ncm)), [produtos])
  const comNcm = produtos.length - semNcm.length
  const pct = produtos.length > 0 ? Math.round((comNcm / produtos.length) * 100) : 100

  /* agrupa os SEM NCM por categoria */
  const porCategoria = useMemo(() => {
    const m = new Map<string, ProdutoFiscal[]>()
    for (const p of semNcm) {
      const c = (p.categoria ?? 'outros').toLowerCase()
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(p)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [semNcm])

  async function salvarNcm(id: string, ncm: string) {
    const limpo = ncm.replace(/\D/g, '')
    if (!ncmValido(limpo)) { aviso('NCM precisa ter 8 dígitos.'); return }
    setSalvando(id)
    const { error } = await supabase.from('estoque').update({ ncm: limpo }).eq('id', id)
    setSalvando(null)
    if (error) { aviso('Erro ao salvar.'); return }
    setProdutos(ps => ps.map(p => p.id === id ? { ...p, ncm: limpo } : p))
    aviso('NCM salvo!')
  }

  async function aplicarPadraoCategoria(cat: string) {
    const padrao = NCM_CAT[cat]
    if (!padrao) { aviso('Sem padrão pra essa categoria — preencha manual.'); return }
    const alvos = semNcm.filter(p => (p.categoria ?? 'outros').toLowerCase() === cat)
    if (alvos.length === 0) return
    setSalvando(cat)
    const ids = alvos.map(p => p.id)
    const { error } = await supabase.from('estoque').update({ ncm: padrao }).in('id', ids)
    setSalvando(null)
    if (error) { aviso('Erro ao aplicar.'); return }
    setProdutos(ps => ps.map(p => ids.includes(p.id) ? { ...p, ncm: padrao } : p))
    aviso(`NCM padrão aplicado em ${alvos.length} produto(s).`)
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] p-6 md:p-8">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border bg-[#C79A54]/10 border-[#C79A54]/30 text-[#E0B36A]">{toast}</div>
      )}
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Saúde fiscal dos produtos</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Cada produto precisa de um <b className="text-zinc-300">NCM</b> (código do produto) pra emitir cupom fiscal — hoje e na reforma. Aqui você vê o que falta e preenche rápido.
          </p>
        </div>

        {/* Resumo */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Produtos com NCM ok</p>
              <p className="text-2xl font-bold text-[#E0B36A]">{comNcm} <span className="text-sm text-zinc-500 font-normal">/ {produtos.length}</span></p>
            </div>
            <p className={`text-sm font-semibold ${semNcm.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {semNcm.length === 0 ? '🎉 Tudo certo!' : `${semNcm.length} sem NCM`}
            </p>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#C79A54] to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {semNcm.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-10 text-center text-zinc-400">
            Todos os produtos têm NCM. Sua casa fiscal está em ordem. ✅
          </div>
        ) : (
          porCategoria.map(([cat, itens]) => (
            <div key={cat} className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200 capitalize">{cat} <span className="text-zinc-500">· {itens.length}</span></h2>
                {NCM_CAT[cat] && (
                  <button
                    onClick={() => aplicarPadraoCategoria(cat)}
                    disabled={salvando === cat}
                    className="text-xs font-semibold text-[#16151A] bg-[#C79A54] hover:bg-[#E0B36A] rounded-lg px-3 py-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    {salvando === cat ? 'Aplicando…' : `Aplicar padrão (${NCM_CAT[cat]})`}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {itens.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{p.nome}</p>
                      {p.marca && <p className="text-[11px] text-zinc-500">{p.marca}</p>}
                    </div>
                    <input
                      defaultValue={p.ncm ?? ''}
                      placeholder="NCM (8 díg.)"
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== (p.ncm ?? '')) salvarNcm(p.id, v) }}
                      className="w-36 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C79A54] [color-scheme:dark]"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <p className="text-xs text-zinc-600">
          Os NCMs padrão são um chute bom por categoria — vale conferir com sua contabilidade pra ficar 100%. O cálculo dos impostos (inclusive CBS/IBS da reforma) é feito pelo emissor; aqui é só o código do produto.
        </p>
      </div>
    </div>
  )
}
