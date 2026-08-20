'use client'

import { useState } from 'react'

type Linha = {
  id: string; nome: string; marca: string | null; cor: string | null
  tamanho: string; qtd: number; escasso: boolean
  dias: number; manual: boolean
  preco_venda: number; preco_custo: number | null
  desconto: number; preco_promo: number; valor: number
}
type Plano = {
  ok: boolean; meta: number
  resumo: { valor_estoque_elegivel: number; tamanhos_protegidos: string[] }
  itens: Linha[]
}

const fBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const chave = (l: Linha) => `${l.id}-${l.tamanho}`

export default function CaixaClient() {
  const [meta, setMeta] = useState(10000)
  const [carregando, setCarregando] = useState(false)
  const [plano, setPlano] = useState<Plano | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [dispensados, setDispensados] = useState<Set<string>>(new Set())

  async function gerar() {
    setCarregando(true); setErro(null); setPlano(null); setDispensados(new Set())
    try {
      const res = await fetch('/api/plano-caixa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta }),
      })
      const d = await res.json()
      if (!d?.ok) { setErro('Não consegui montar o plano. Tente de novo.'); return }
      setPlano(d)
    } catch { setErro('Falha de conexão.') }
    finally { setCarregando(false) }
  }

  function dispensar(k: string) {
    setDispensados(prev => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s })
  }

  const mantidos = (plano?.itens ?? []).filter(l => !dispensados.has(chave(l)))
  const totalMantido = mantidos.reduce((s, l) => s + l.valor, 0)
  const pecasMantidas = mantidos.reduce((s, l) => s + l.qtd, 0)
  const pctMeta = meta > 0 ? Math.min(100, Math.round((totalMantido / meta) * 100)) : 0

  return (
    <div className="min-h-screen bg-[#080B10] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h1 className="text-2xl font-bold">Levantar Caixa</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6 max-w-2xl">
A IA cruza o que <b className="text-zinc-300">mais vende</b> (histórico) com o que está <b className="text-zinc-300">parado</b>: já <b className="text-zinc-300">tira da queima os tamanhos bons vendedores</b> (ficam no preço cheio) e lista só o encalhe. <b className="text-zinc-300">Cada linha é uma peça + tamanho</b> — dá um <b className="text-zinc-300">×</b> pra dispensar o que não faz sentido. Só produtos com +60 dias de nota (cadastro manual = estoque antigo), desconto até 50%, nunca abaixo do custo.
        </p>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quanto você quer levantar?</label>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-zinc-500 text-lg">R$</span>
              <input type="number" min={0} step={500} value={meta}
                onChange={e => setMeta(Math.max(0, Number(e.target.value)))}
                className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold outline-none focus:border-violet-500" />
            </div>
          </div>
          <button onClick={gerar} disabled={carregando}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition cursor-pointer">
            {carregando ? 'Analisando estoque…' : 'Gerar plano'}
          </button>
        </div>

        {erro && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">{erro}</div>}

        {plano && (
          <>
            {/* Progresso vs meta */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-5 sticky top-2 z-10">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Você mantém</p>
                  <p className="text-2xl font-bold text-emerald-400">{fBRL(totalMantido)} <span className="text-sm text-zinc-500 font-normal">/ meta {fBRL(meta)}</span></p>
                </div>
                <p className="text-sm text-zinc-400">{pecasMantidas} peça{pecasMantidas !== 1 ? 's' : ''} · {mantidos.length} linha{mantidos.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all" style={{ width: `${pctMeta}%` }} />
              </div>
              {plano.resumo.tamanhos_protegidos.length > 0 && (
                <p className="text-[11px] text-zinc-500 mt-3">🛡️ Já tirei da queima (você vende bem, giro alto): {plano.resumo.tamanhos_protegidos.map(t => (
                  <span key={t} className="inline-block text-[10px] font-bold bg-violet-500/20 text-violet-200 px-1.5 py-0.5 rounded-full ml-1">{t}</span>
                ))}</p>
              )}
            </div>

            {plano.itens.length === 0 ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center text-zinc-400">
                Nenhuma peça com +60 dias e margem pra desconto. Seu estoque está girando bem! 🎉
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {plano.itens.map(l => {
                  const k = chave(l)
                  const fora = dispensados.has(k)
                  return (
                    <div key={k} className={`border rounded-xl px-4 py-3 flex items-center gap-3 transition ${fora ? 'border-zinc-800/50 bg-zinc-900/30 opacity-45' : 'border-zinc-800 bg-zinc-900/60'}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.escasso ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'bg-zinc-800 text-zinc-300'}`}>{l.tamanho}{l.escasso ? ' 🛡️' : ''}</span>
                          <p className={`font-semibold text-sm truncate ${fora ? 'line-through' : ''}`}>{l.nome}</p>
                          <span className="text-xs text-zinc-500">{l.qtd}un</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {[l.marca, l.cor].filter(Boolean).join(' · ')}
                          <span className="ml-1.5 text-amber-400">{l.manual ? 'estoque antigo' : `parado ${l.dias}d`}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-zinc-600 line-through leading-none">{fBRL(l.preco_venda)}</p>
                        <p className="text-base font-bold text-emerald-400 leading-tight">{fBRL(l.preco_promo)}</p>
                        <span className="text-[10px] font-bold bg-red-500/15 text-red-300 px-1.5 py-0.5 rounded-full">-{l.desconto}%</span>
                      </div>
                      <button onClick={() => dispensar(k)} title={fora ? 'Incluir de volta' : 'Dispensar'}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 font-bold text-lg leading-none cursor-pointer">
                        {fora ? '+' : '×'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
