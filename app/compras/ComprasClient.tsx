'use client'

import { useState } from 'react'

interface PublicoData {
  total: number
  genero: { M: number; F: number; sem: number }
  faixaEtaria: Array<{ label: string; count: number }>
  semNasc: number
  camiseta: Array<{ tamanho: string; count: number; pct: number }>
  calca:    Array<{ tamanho: string; count: number; pct: number }>
  tenis:    Array<{ tamanho: string; count: number; pct: number }>
  camisa:   { total: number; mc: number; ml: number; sem: number }
}

function r(n: number, t: number) { return t ? Math.round(n / t * 100) : 0 }

function PublicoSection({ p }: { p: PublicoData }) {
  const [open, setOpen] = useState(true)
  if (!p.total) return null

  const pF = r(p.genero.F, p.total)
  const pM = r(p.genero.M, p.total)
  const pS = 100 - pF - pM
  const maxFaixa = Math.max(...p.faixaEtaria.map(f => f.count), 1)
  const faixas = p.faixaEtaria.filter(f => f.count > 0)

  const tamanhos = [
    { label: 'Camiseta', items: p.camiseta, color: '#3B6FFF' },
    { label: 'Calça',    items: p.calca,    color: '#a855f7' },
    { label: 'Tênis',    items: p.tenis,    color: '#00D4AA' },
  ]

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-zinc-900 hover:bg-zinc-800/60 transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-white">Perfil do Público</span>
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">{p.total} clientes</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-zinc-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="border-t border-zinc-800 bg-zinc-900/40 p-5 space-y-3">

          {/* Gênero + Faixa etária lado a lado */}
          <div className="grid sm:grid-cols-2 gap-3">

            {/* Gênero */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-4">Gênero</p>
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="text-3xl font-bold text-purple-400 leading-none">{pF}<span className="text-lg">%</span></p>
                  <p className="text-xs text-zinc-500 mt-1">Feminino · {p.genero.F}</p>
                </div>
                <div className="flex-1 h-px bg-zinc-800" />
                <div className="text-right">
                  <p className="text-3xl font-bold text-[#3B6FFF] leading-none">{pM}<span className="text-lg">%</span></p>
                  <p className="text-xs text-zinc-500 mt-1">{p.genero.M} · Masculino</p>
                </div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {pF > 0 && <div style={{ width: `${pF}%`, backgroundColor: '#a855f7' }} className="rounded-full" />}
                {pM > 0 && <div style={{ width: `${pM}%`, backgroundColor: '#3B6FFF' }} className="rounded-full" />}
                {pS > 0 && <div style={{ width: `${pS}%` }} className="bg-zinc-700 rounded-full" />}
              </div>
              {p.genero.sem > 0 && (
                <p className="text-[11px] text-zinc-600 mt-2">{p.genero.sem} sem gênero cadastrado</p>
              )}
            </div>

            {/* Faixa etária */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Faixa Etária</p>
                {p.semNasc > 0 && <span className="text-[11px] text-zinc-600">{p.semNasc} sem data</span>}
              </div>
              {faixas.length === 0 ? (
                <p className="text-sm text-zinc-600">Sem datas cadastradas</p>
              ) : (
                <div className="space-y-3">
                  {faixas.map(f => (
                    <div key={f.label} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-12 shrink-0 text-right font-mono">{f.label}</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00D4AA] rounded-full"
                          style={{ width: `${Math.round(f.count / maxFaixa * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-zinc-300 w-7 shrink-0 text-right">{f.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tamanhos */}
          <div className="grid sm:grid-cols-3 gap-3">
            {tamanhos.map(({ label, items, color }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">{label}</p>
                {!items.length ? (
                  <p className="text-xs text-zinc-600">Sem dados</p>
                ) : (
                  <div className="space-y-2.5">
                    {items.slice(0, 6).map(t => (
                      <div key={t.tamanho} className="flex items-center gap-2.5">
                        <span className="text-xs font-mono text-zinc-400 w-9 shrink-0 text-right">{t.tamanho}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(5, t.pct)}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-xs font-semibold text-zinc-300 w-8 shrink-0 text-right">{t.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Camisa Social — breakdown MC/ML */}
          {p.camisa.total > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Camisa Social no Estoque</p>
                <span className="text-xs text-zinc-600">{p.camisa.total} peças</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Manga Curta', count: p.camisa.mc, color: '#f97316' },
                  { label: 'Manga Longa', count: p.camisa.ml, color: '#fb923c' },
                  { label: 'Sem info',    count: p.camisa.sem, color: '#52525b' },
                ].filter(item => item.count > 0).map(item => (
                  <div key={item.label} className="flex flex-col gap-1.5">
                    <div className="flex items-end justify-between">
                      <span className="text-xs text-zinc-500">{item.label}</span>
                      <span className="text-sm font-bold text-white">{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r(item.count, p.camisa.total)}%`, backgroundColor: item.color }} />
                    </div>
                    <span className="text-[11px] text-zinc-600">{r(item.count, p.camisa.total)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

interface TamanhoItem {
  tamanho: string
  pct: number
  qtd: number
}

interface ResultPedido {
  analise: string
  velocidade_mensal_valor: number
  cobertura_atual_meses: number
  valor_comprar: number
  valor_comprar_venda: number
  pecas_comprar: number
  distribuicao_tamanhos: TamanhoItem[]
  alerta_dados_insuficientes: boolean
  observacoes: string[]
}

interface MarcaResult {
  marca: string
  pct_mix: number
  valor_comprar: number
  valor_comprar_venda: number
  pecas_estimadas: number
  cobertura_atual_meses: number
  distribuicao_tamanhos: TamanhoItem[]
}

interface ResultMeta {
  analise: string
  total_investir: number
  por_marca: MarcaResult[]
  alerta_dados_insuficientes: boolean
  observacoes: string[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function TamanhosBar({ tamanhos }: { tamanhos: TamanhoItem[] }) {
  if (!tamanhos?.length) return <p className="text-xs text-zinc-500">Sem dados de tamanho</p>
  const sorted = [...tamanhos].sort((a, b) => b.pct - a.pct)
  return (
    <div className="space-y-2">
      {sorted.map(t => (
        <div key={t.tamanho} className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 w-8 shrink-0">{t.tamanho}</span>
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3B6FFF] rounded-full transition-all"
              style={{ width: `${Math.min(100, t.pct)}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400 w-14 text-right shrink-0">{t.pct}% · {t.qtd}un</span>
        </div>
      ))}
    </div>
  )
}

const PERIODOS = [1, 2, 3, 4, 6]

export default function ComprasClient({ marcas, publico }: { marcas: string[]; publico: PublicoData }) {
  const [modo, setModo]         = useState<'pedido' | 'meta'>('pedido')
  const [marca, setMarca]       = useState(marcas[0] ?? '')
  const [marcaCustom, setMarcaCustom] = useState('')
  const [marcasSel, setMarcasSel]     = useState<string[]>(marcas.slice(0, 3))
  const [periodo, setPeriodo]   = useState(3)
  const [metaValor, setMetaValor]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado]     = useState<{ modo: string; result: ResultPedido | ResultMeta; mesesAnalisados: number } | null>(null)
  const [erro, setErro]         = useState<string | null>(null)

  const marcaFinal = marcaCustom.trim() || marca

  function toggleMarca(m: string) {
    setMarcasSel(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  async function analisar() {
    setLoading(true); setErro(null); setResultado(null)
    try {
      const body = modo === 'pedido'
        ? { modo, marca: marcaFinal, periodo }
        : { modo, marcas: marcasSel, periodo, meta_faturamento: Number(metaValor.replace(/\D/g, '')) }

      const res  = await fetch('/api/compras/analisar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao analisar')
      setResultado(data)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  const resPedido = resultado?.modo === 'pedido' ? resultado.result as ResultPedido : null
  const resMeta   = resultado?.modo === 'meta'   ? resultado.result as ResultMeta   : null

  return (
    <div className="min-h-screen bg-[#080B10] text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Auxiliador de Compras</h1>
          <p className="text-sm text-zinc-400 mt-1">A IA analisa o ritmo da sua loja e recomenda quanto comprar de cada marca e tamanho.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
          {(['pedido', 'meta'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setModo(m); setResultado(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                modo === m ? 'bg-[#3B6FFF] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'pedido' ? 'Pedido por marca' : 'Meta de faturamento'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">

          {modo === 'pedido' ? (
            <>
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2 block">Qual marca você vai pedir?</label>
                {marcas.length > 0 && (
                  <select
                    value={marca}
                    onChange={e => { setMarca(e.target.value); setMarcaCustom('') }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#3B6FFF] mb-2"
                  >
                    {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  placeholder={marcas.length > 0 ? 'Ou digitar outra marca...' : 'Nome da marca'}
                  value={marcaCustom}
                  onChange={e => setMarcaCustom(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#3B6FFF]"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2 block">Quanto quer faturar?</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="30.000"
                    value={metaValor}
                    onChange={e => setMetaValor(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#3B6FFF]"
                  />
                </div>
              </div>

              {marcas.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2 block">Quais marcas incluir?</label>
                  <div className="flex flex-wrap gap-2">
                    {marcas.map(m => (
                      <button
                        key={m}
                        onClick={() => toggleMarca(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          marcasSel.includes(m)
                            ? 'bg-[#3B6FFF]/20 border-[#3B6FFF]/50 text-[#7FA8FF]'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {marcasSel.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">Selecione ao menos uma marca</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Período */}
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2 block">Para quantos meses?</label>
            <div className="flex gap-2">
              {PERIODOS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition cursor-pointer ${
                    periodo === p
                      ? 'bg-[#3B6FFF]/20 border-[#3B6FFF]/50 text-[#7FA8FF]'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {p}m
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={analisar}
            disabled={loading || (modo === 'meta' && (!metaValor || marcasSel.length === 0))}
            className="w-full py-3 bg-[#3B6FFF] hover:bg-[#2d5fe6] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition text-sm cursor-pointer"
          >
            {loading ? 'Analisando...' : 'Analisar com IA'}
          </button>

          {erro && <p className="text-sm text-red-400">{erro}</p>}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 text-sm text-zinc-400 px-1">
            <div className="w-4 h-4 border-2 border-[#3B6FFF] border-t-transparent rounded-full animate-spin shrink-0" />
            Calculando ritmo de vendas e consultando IA...
          </div>
        )}

        {/* Result */}
        {resultado && (
          <div className="space-y-4">

            {/* Aviso dados insuficientes */}
            {(resPedido?.alerta_dados_insuficientes || resMeta?.alerta_dados_insuficientes) && (
              <div className="flex gap-2 items-start bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>Baseado em <strong>{resultado.mesesAnalisados} {resultado.mesesAnalisados === 1 ? 'mês' : 'meses'}</strong> de histórico. Os números são uma referência — conforme você usar o Zivo, as recomendações ficam mais precisas.</span>
              </div>
            )}

            {/* Análise da IA */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🧑‍💼</span>
                <h2 className="font-semibold text-zinc-100">Análise</h2>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {(resPedido ?? resMeta)?.analise}
              </p>
            </div>

            {/* Resultado modo PEDIDO */}
            {resPedido && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    <p className="text-xs text-zinc-500 mb-1">Velocidade/mês</p>
                    <p className="text-lg font-bold text-white">{fmt(resPedido.velocidade_mensal_valor)}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    <p className="text-xs text-zinc-500 mb-1">Cobertura atual</p>
                    <p className="text-lg font-bold text-white">{resPedido.cobertura_atual_meses.toFixed(1)}m</p>
                  </div>
                  <div className="bg-[#3B6FFF]/10 border border-[#3B6FFF]/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-[#7FA8FF] mb-1">Investir (custo)</p>
                    <p className="text-lg font-bold text-white">{fmt(resPedido.valor_comprar)}</p>
                    <p className="text-xs text-zinc-500">{resPedido.pecas_comprar} peças</p>
                    {resPedido.valor_comprar_venda > 0 && (
                      <p className="text-xs text-zinc-600 mt-1">≈ {fmt(resPedido.valor_comprar_venda)} em venda</p>
                    )}
                  </div>
                </div>

                {resPedido.distribuicao_tamanhos?.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-zinc-100 mb-4">Distribuição por tamanho</h3>
                    <TamanhosBar tamanhos={resPedido.distribuicao_tamanhos} />
                  </div>
                )}
              </>
            )}

            {/* Resultado modo META */}
            {resMeta && (
              <>
                <div className="bg-[#3B6FFF]/10 border border-[#3B6FFF]/30 rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#7FA8FF] mb-1">Total a investir em compras</p>
                    <p className="text-2xl font-bold text-white">{fmt(resMeta.total_investir)}</p>
                  </div>
                  <span className="text-3xl">🛒</span>
                </div>

                <div className="space-y-3">
                  {resMeta.por_marca?.map(m => (
                    <div key={m.marca} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-zinc-100">{m.marca}</h3>
                          <p className="text-xs text-zinc-500">{m.pct_mix.toFixed(0)}% do mix · cobertura atual {m.cobertura_atual_meses.toFixed(1)}m</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{fmt(m.valor_comprar)}</p>
                          <p className="text-xs text-zinc-500">custo · ~{m.pecas_estimadas} peças</p>
                          {m.valor_comprar_venda > 0 && (
                            <p className="text-xs text-zinc-600">≈ {fmt(m.valor_comprar_venda)} venda</p>
                          )}
                        </div>
                      </div>
                      {m.distribuicao_tamanhos?.length > 0 && (
                        <>
                          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Tamanhos</p>
                          <TamanhosBar tamanhos={m.distribuicao_tamanhos} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Observações */}
            {((resPedido ?? resMeta)?.observacoes?.length ?? 0) > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 space-y-1">
                {(resPedido ?? resMeta)!.observacoes.map((obs, i) => (
                  <p key={i} className="text-xs text-zinc-400">· {obs}</p>
                ))}
              </div>
            )}

          </div>
        )}

        {/* Perfil do público */}
        <PublicoSection p={publico} />

      </div>
    </div>
  )
}
