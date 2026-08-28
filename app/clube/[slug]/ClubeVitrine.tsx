'use client'

import { useState } from 'react'

type Item = {
  id: string
  nome: string
  marca: string | null
  cor: string | null
  categoria: string | null
  preco_venda: number | null
  preco_oportunidade: number | null
  combo: boolean
  combo_texto: string | null
  tamanhos: string[]
  foto: string | null
}

function fBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/* Ordem fixa da vitrine: camiseta → polo → calça → bermuda → resto */
const ORDEM_CAT = ['camiseta', 'polo', 'calca', 'bermuda']
function ordCat(c: string | null) {
  const i = ORDEM_CAT.indexOf((c ?? '').toLowerCase())
  return i >= 0 ? i : ORDEM_CAT.length
}

/* Ordem natural de tamanho (letras primeiro, numéricos depois em ordem) */
const ORDEM_TAM = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'EXG']
function ordTam(t: string) {
  const up = t.toUpperCase().trim()
  const i = ORDEM_TAM.indexOf(up)
  if (i >= 0) return i
  const n = parseInt(up, 10)
  if (!isNaN(n)) return 100 + n
  return 999
}

type CartItem = { key: string; estoqueId: string; nome: string; tamanho: string; preco: number; foto: string | null }

export default function ClubeVitrine({ nomeLoja, logo, comoComprar, ownerPhone, slug, email, mpAtivo, itens }: { nomeLoja: string; logo: string | null; comoComprar: string | null; ownerPhone: string | null; slug: string; email: string; mpAtivo: boolean; itens: Item[] }) {
  const [tamSel, setTamSel] = useState<Record<string, string>>({})
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [comprando, setComprando] = useState(false)
  const [tamFiltro, setTamFiltro] = useState<string>('')
  const [filtroAberto, setFiltroAberto] = useState(false)
  const [alertaTam, setAlertaTam] = useState<string | null>(null)  // peça pedindo tamanho

  const total = cart.reduce((s, c) => s + c.preco, 0)

  // Tamanhos existentes na vitrine (pro filtro), em ordem natural
  const tamanhosDisponiveis = Array.from(new Set(itens.flatMap(i => i.tamanhos.map(t => t.toUpperCase().trim()))))
    .sort((a, b) => ordTam(a) - ordTam(b))
  // Separa letras (roupa) de numeração (calçado/calça numérica)
  const ehNumero = (t: string) => /^\d+$/.test(t.trim())
  const tamsLetra = tamanhosDisponiveis.filter(t => !ehNumero(t))
  const tamsNumero = tamanhosDisponiveis.filter(t => ehNumero(t))

  // Ordem fixa por categoria + filtro por tamanho
  const visiveis = itens
    .filter(i => !tamFiltro || i.tamanhos.some(t => t.toUpperCase().trim() === tamFiltro))
    .sort((a, b) => ordCat(a.categoria) - ordCat(b.categoria))

  const zap = (it: Item) => {
    const fone = (ownerPhone ?? '').replace(/\D/g, '')
    const cond = it.combo && it.combo_texto ? ` (combo: ${it.combo_texto})` : ''
    const msg = encodeURIComponent(`Oi! Vi no Clube ${nomeLoja} e quero: ${it.nome}${it.marca ? ` (${it.marca})` : ''} — ${fBRL(it.preco_oportunidade)}${cond}`)
    return fone ? `https://wa.me/${fone.startsWith('55') ? fone : '55' + fone}?text=${msg}` : '#'
  }

  function adicionar(it: Item) {
    const tam = it.tamanhos.length === 1 ? it.tamanhos[0] : (tamSel[it.id] || '')
    if (it.tamanhos.length > 1 && !tam) { setAlertaTam(it.id); return }  // pede o tamanho ali mesmo
    setAlertaTam(null)
    const preco = it.preco_oportunidade ?? it.preco_venda ?? 0
    setCart(c => [...c, { key: `${it.id}-${tam}-${Date.now()}`, estoqueId: it.id, nome: `${it.nome}${it.marca ? ` (${it.marca})` : ''}${tam ? ` — ${tam}` : ''}`, tamanho: tam, preco, foto: it.foto }])
    setShowCart(true)
  }

  async function finalizar() {
    if (cart.length === 0) return
    setComprando(true)
    try {
      const res = await fetch('/api/clube/comprar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, itens: cart.map(c => ({ estoqueId: c.estoqueId, tamanho: c.tamanho || null })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (d?.ok && d.url) { window.location.href = d.url }
      else { alert(d?.erro || 'Não foi possível iniciar o pagamento.'); setComprando(false) }
    } catch { alert('Falha ao iniciar o pagamento.'); setComprando(false) }
  }

  return (
    <div className="relative min-h-screen bg-[#07070a] text-white">
      {/* brilho de fundo */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-[-200px] h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-violet-700/12 blur-[140px]" />
      </div>

      {/* Cabeçalho branded */}
      <header className="sticky top-0 z-20 bg-[#07070a]/85 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-5 py-3.5">
          {logo
            ? <div className="w-10 h-10 rounded-xl bg-black ring-1 ring-white/10 overflow-hidden flex items-center justify-center shrink-0"><img src={logo} alt={nomeLoja} className="w-full h-full object-contain" /></div>
            : <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-lg shrink-0">👑</div>}
          <div className="min-w-0">
            <h1 className="font-bold leading-tight truncate">{nomeLoja}</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300/80 leading-tight">👑 Clube VIP</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-5 pb-28 pt-6">
        {/* Hero */}
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight">Ofertas exclusivas de VIP</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {itens.length > 0
              ? <>Preços que só quem é do clube vê. <span className="text-violet-300 font-medium">{itens.length} {itens.length === 1 ? 'peça disponível' : 'peças disponíveis'}.</span></>
              : 'As ofertas do clube aparecem aqui.'}
          </p>
        </div>

        {/* Filtro por tamanho (retrátil) */}
        {itens.length > 0 && tamanhosDisponiveis.length > 1 && (
          <div className="mb-5 flex justify-end">
            <div className="relative">
              <button onClick={() => setFiltroAberto(o => !o)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${tamFiltro || filtroAberto ? 'border-violet-500/50 bg-violet-600/15 text-violet-100' : 'border-white/[0.12] bg-white/[0.04] text-zinc-300 hover:border-white/25'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                {tamFiltro ? <>Tamanho <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{tamFiltro}</span></> : 'Filtrar tamanho'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`opacity-60 transition-transform ${filtroAberto ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {filtroAberto && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setFiltroAberto(false)} />
                  <div className="absolute right-0 mt-2 z-30 w-60 rounded-2xl border border-white/10 bg-[#0d0d13] p-3 shadow-2xl shadow-black/60">
                    <button onClick={() => { setTamFiltro(''); setFiltroAberto(false) }}
                      className={`w-full rounded-lg py-1.5 text-xs font-semibold border transition ${!tamFiltro ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/12 text-zinc-400 hover:text-white hover:border-white/30'}`}>Todos</button>
                    {tamsLetra.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tamanho</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {tamsLetra.map(t => (
                            <button key={t} onClick={() => { setTamFiltro(f => f === t ? '' : t); setFiltroAberto(false) }}
                              className={`rounded-lg py-1.5 text-xs font-semibold border transition ${tamFiltro === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/12 text-zinc-300 hover:text-white hover:border-white/30'}`}>{t}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {tamsNumero.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Numeração</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {tamsNumero.map(t => (
                            <button key={t} onClick={() => { setTamFiltro(f => f === t ? '' : t); setFiltroAberto(false) }}
                              className={`rounded-lg py-1.5 text-xs font-semibold border transition ${tamFiltro === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/12 text-zinc-300 hover:text-white hover:border-white/30'}`}>{t}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {itens.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-4xl mb-3">🛍️</p>
            <p className="text-zinc-300 font-medium">Nenhuma oferta no momento.</p>
            <p className="text-zinc-500 text-sm mt-1">Fica de olho — a gente avisa quando chegar coisa nova!</p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-zinc-300 font-medium">Nada no tamanho {tamFiltro}.</p>
            <button onClick={() => setTamFiltro('')} className="text-violet-300 text-sm mt-1 hover:underline">Ver todos os tamanhos</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {visiveis.map(it => {
              const desc = it.preco_venda && it.preco_oportunidade && it.preco_venda > it.preco_oportunidade
                ? Math.round((1 - it.preco_oportunidade / it.preco_venda) * 100) : 0
              return (
                <div key={it.id} className="group bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col transition hover:border-violet-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-950/30">
                  <div className="aspect-square bg-zinc-900 relative overflow-hidden">
                    {it.foto ? <img src={it.foto} alt={it.nome} className="w-full h-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center text-zinc-700 text-3xl">🛍️</div>}
                    {desc > 0 && <span className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg">-{desc}%</span>}
                    {it.combo && <span className="absolute top-2 right-2 bg-amber-500/90 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow">⚡ COMBO</span>}
                  </div>
                  <div className="p-3 flex flex-col gap-1 flex-1">
                    <p className="text-sm font-medium leading-tight line-clamp-2">{it.nome}</p>
                    <p className="text-[11px] text-zinc-500">{[it.marca, it.cor].filter(Boolean).join(' · ')}</p>
                    {it.combo && it.combo_texto && (
                      <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-1 leading-snug mt-0.5">{it.combo_texto}</p>
                    )}
                    <div className="mt-auto pt-1.5">
                      {desc > 0 && <p className="text-[11px] text-zinc-600 line-through leading-none">{fBRL(it.preco_venda)}</p>}
                      <p className="text-lg font-bold text-emerald-400 leading-tight">{fBRL(it.preco_oportunidade ?? it.preco_venda)}</p>
                    </div>
                    {mpAtivo && !it.combo ? (
                      <>
                        {it.tamanhos.length > 1 && (() => {
                          const pedindo = alertaTam === it.id
                          return (
                            <div className={`mt-1.5 rounded-lg transition ${pedindo ? 'ring-1 ring-amber-400/60 bg-amber-500/[0.07] p-1.5' : ''}`}>
                              {pedindo && <p className="text-[11px] font-semibold text-amber-300 mb-1">👇 Escolha o tamanho</p>}
                              <div className="flex flex-wrap gap-1">
                                {it.tamanhos.map(t => (
                                  <button key={t} onClick={() => { setTamSel(s => ({ ...s, [it.id]: t })); setAlertaTam(a => a === it.id ? null : a) }}
                                    className={`min-w-[28px] px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${tamSel[it.id] === t ? 'bg-violet-600 border-violet-500 text-white' : pedindo ? 'border-amber-400/50 text-amber-100 hover:border-amber-300' : 'border-white/15 text-zinc-400 hover:text-white hover:border-white/30'}`}>{t}</button>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        {it.tamanhos.length === 1 && <p className="text-[11px] text-zinc-600 mt-1">Tam: {it.tamanhos[0]}</p>}
                        <button onClick={() => adicionar(it)}
                          className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg py-2 transition active:scale-[0.98]">
                          <span>🛒</span> {alertaTam === it.id ? 'Escolha o tamanho acima' : 'Adicionar'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-zinc-600 mt-1">Tam: {it.tamanhos.join(' / ')}</p>
                        <a href={zap(it)} target="_blank" rel="noopener noreferrer"
                          className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg py-2 transition active:scale-[0.98]">
                          Quero essa
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {comoComprar && comoComprar.trim() && (
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <h2 className="font-semibold text-sm mb-2 flex items-center gap-2">💡 Como comprar</h2>
            <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{comoComprar}</p>
          </div>
        )}
        <p className="text-center text-xs text-zinc-700 mt-8">Clube {nomeLoja} · ofertas por tempo limitado</p>
      </main>

      {/* Barra do carrinho */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-full pl-5 pr-3 py-3 shadow-2xl shadow-emerald-950/50 transition active:scale-[0.98]">
          <span className="font-semibold text-sm">🛒 {cart.length} {cart.length === 1 ? 'item' : 'itens'} · {fBRL(total)}</span>
          <span className="bg-white/20 rounded-full px-3 py-1 text-sm font-bold">Ver</span>
        </button>
      )}

      {/* Carrinho */}
      {showCart && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-[#0c0c11] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h2 className="font-bold flex items-center gap-2">🛒 Seu carrinho</h2>
              <button onClick={() => setShowCart(false)} className="text-zinc-500 hover:text-white text-sm">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">Carrinho vazio.</p>}
              {cart.map(c => (
                <div key={c.key} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-2 text-sm">
                  <div className="w-11 h-11 rounded-lg bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                    {c.foto ? <img src={c.foto} alt="" className="w-full h-full object-cover" /> : <span>🛍️</span>}
                  </div>
                  <span className="flex-1 min-w-0 truncate">{c.nome}</span>
                  <span className="text-emerald-400 font-semibold shrink-0">{fBRL(c.preco)}</span>
                  <button onClick={() => setCart(x => x.filter(i => i.key !== c.key))} className="text-zinc-500 hover:text-red-400 shrink-0 text-lg leading-none px-1">×</button>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/10 shrink-0 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total</span>
                <span className="text-xl font-bold text-emerald-400">{fBRL(total)}</span>
              </div>
              <button onClick={finalizar} disabled={comprando || cart.length === 0}
                className="w-full text-center text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg py-3 transition disabled:opacity-60 active:scale-[0.99]">
                {comprando ? 'Abrindo pagamento...' : 'Finalizar compra'}
              </button>
              <button onClick={() => setShowCart(false)} className="w-full text-center text-xs text-zinc-500 hover:text-white transition">Continuar comprando</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
