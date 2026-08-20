'use client'

import { useState } from 'react'

type ItemPlano = {
  id: string; nome: string; marca: string | null; cor: string | null
  dias: number; manual: boolean; preco_venda: number; preco_custo: number | null
  desconto: number; preco_promo: number
  tamanhos: { tamanho: string; qtd: number; escasso: boolean }[]
  pecas: number; valor_promo: number
}
type Plano = {
  ok: boolean; meta: number
  resumo: {
    valor_estoque_elegivel: number; produtos_no_plano: number; pecas: number
    valor_promocional: number; desconto_total: number; tamanhos_protegidos: string[]
  }
  itens: ItemPlano[]
}

const fBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export default function CaixaClient() {
  const [meta, setMeta] = useState(10000)
  const [carregando, setCarregando] = useState(false)
  const [plano, setPlano] = useState<Plano | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    setCarregando(true); setErro(null); setPlano(null)
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

  return (
    <div className="min-h-screen bg-[#080B10] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h1 className="text-2xl font-bold">Levantar Caixa</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6 max-w-2xl">
          A IA analisa seu estoque e monta um plano de promoção pra você fazer caixa <b className="text-zinc-300">equilibrando o estoque</b>: desova o que está encalhado e <b className="text-zinc-300">protege os tamanhos que você mais vende</b>. Só produtos com +60 dias de nota (produto cadastrado na mão = estoque antigo, sempre entra), desconto até 50%, nunca abaixo do custo.
        </p>

        {/* Controles */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quanto você quer levantar?</label>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-zinc-500 text-lg">R$</span>
              <input
                type="number" min={0} step={500} value={meta}
                onChange={e => setMeta(Math.max(0, Number(e.target.value)))}
                className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <button
            onClick={gerar} disabled={carregando}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition cursor-pointer"
          >
            {carregando ? 'Analisando estoque…' : 'Gerar plano'}
          </button>
        </div>

        {erro && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">{erro}</div>}

        {plano && (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Em promoção</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{fBRL(plano.resumo.valor_promocional)}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Peças</p>
                <p className="text-xl font-bold mt-1">{plano.resumo.pecas}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Desconto dado</p>
                <p className="text-xl font-bold text-amber-400 mt-1">{fBRL(plano.resumo.desconto_total)}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Estoque parado</p>
                <p className="text-xl font-bold mt-1">{fBRL(plano.resumo.valor_estoque_elegivel)}</p>
              </div>
            </div>

            {plano.resumo.tamanhos_protegidos.length > 0 && (
              <div className="bg-violet-500/5 border border-violet-500/25 rounded-xl px-4 py-3 mb-5 text-sm text-zinc-300">
                🛡️ <b>Tamanhos protegidos</b> (você mais vende, entram pouco ou nada): {plano.resumo.tamanhos_protegidos.map(t => (
                  <span key={t} className="inline-block text-xs font-bold bg-violet-500/20 text-violet-200 px-2 py-0.5 rounded-full ml-1">{t}</span>
                ))}
              </div>
            )}

            {plano.itens.length === 0 ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center text-zinc-400">
                Nenhum produto com +60 dias e margem pra desconto. Seu estoque está girando bem! 🎉
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-500 mb-1">Oferte essas peças com desconto (as primeiras são as mais paradas — foca nelas):</p>
                {plano.itens.map((it, i) => (
                  <div key={it.id} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 font-mono">#{i + 1}</span>
                          <p className="font-semibold truncate">{it.nome}</p>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {[it.marca, it.cor].filter(Boolean).join(' · ')}
                          <span className="ml-1.5 text-amber-400">{it.manual ? 'estoque antigo' : `parado ${it.dias}d`}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-zinc-600 line-through">{fBRL(it.preco_venda)}</p>
                        <p className="text-lg font-bold text-emerald-400 leading-tight">{fBRL(it.preco_promo)}</p>
                        <span className="text-[11px] font-bold bg-red-500/15 text-red-300 px-1.5 py-0.5 rounded-full">-{it.desconto}%</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {it.tamanhos.map(t => (
                        <span key={t.tamanho} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.escasso ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'bg-zinc-800 text-zinc-300'}`}>
                          {t.tamanho} ({t.qtd}){t.escasso ? ' 🛡️' : ''}
                        </span>
                      ))}
                      <span className="text-[11px] text-zinc-500 self-center ml-auto">{it.pecas} peça{it.pecas !== 1 ? 's' : ''} · {fBRL(it.valor_promo)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
