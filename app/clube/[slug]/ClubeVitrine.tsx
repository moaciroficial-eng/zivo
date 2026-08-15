'use client'

import { useState } from 'react'

type Item = {
  id: string
  nome: string
  marca: string | null
  cor: string | null
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

type CartItem = { key: string; estoqueId: string; nome: string; tamanho: string; preco: number }

export default function ClubeVitrine({ nomeLoja, logo, comoComprar, ownerPhone, slug, email, mpAtivo, itens }: { nomeLoja: string; logo: string | null; comoComprar: string | null; ownerPhone: string | null; slug: string; email: string; mpAtivo: boolean; itens: Item[] }) {
  const [tamSel, setTamSel] = useState<Record<string, string>>({})
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [comprando, setComprando] = useState(false)

  const total = cart.reduce((s, c) => s + c.preco, 0)

  const zap = (it: Item) => {
    const fone = (ownerPhone ?? '').replace(/\D/g, '')
    const cond = it.combo && it.combo_texto ? ` (combo: ${it.combo_texto})` : ''
    const msg = encodeURIComponent(`Oi! Vi no Clube ${nomeLoja} e quero: ${it.nome}${it.marca ? ` (${it.marca})` : ''} — ${fBRL(it.preco_oportunidade)}${cond}`)
    return fone ? `https://wa.me/${fone.startsWith('55') ? fone : '55' + fone}?text=${msg}` : '#'
  }

  function adicionar(it: Item) {
    const tam = it.tamanhos.length === 1 ? it.tamanhos[0] : (tamSel[it.id] || '')
    if (it.tamanhos.length > 1 && !tam) { alert('Escolha o tamanho primeiro.'); return }
    const preco = it.preco_oportunidade ?? it.preco_venda ?? 0
    setCart(c => [...c, { key: `${it.id}-${tam}-${Date.now()}`, estoqueId: it.id, nome: `${it.nome}${it.marca ? ` (${it.marca})` : ''}${tam ? ` — ${tam}` : ''}`, tamanho: tam, preco }])
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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur border-b border-zinc-800/60 px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5">
          {logo
            ? <img src={logo} alt={nomeLoja} className="w-9 h-9 rounded-lg object-contain bg-white/5" />
            : <span className="text-xl">👑</span>}
          <div>
            <h1 className="font-bold leading-tight">Clube {nomeLoja}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Ofertas exclusivas de VIP</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-5">
        {itens.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🛍️</p>
            <p className="text-zinc-400">Nenhuma oferta no momento.</p>
            <p className="text-zinc-600 text-sm mt-1">Fica de olho — a gente avisa quando chegar coisa nova!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {itens.map(it => {
              const desc = it.preco_venda && it.preco_oportunidade && it.preco_venda > it.preco_oportunidade
                ? Math.round((1 - it.preco_oportunidade / it.preco_venda) * 100) : 0
              return (
                <div key={it.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
                  <div className="aspect-square bg-zinc-800 relative">
                    {it.foto ? <img src={it.foto} alt={it.nome} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">🛍️</div>}
                    {desc > 0 && <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">-{desc}%</span>}
                  </div>
                  <div className="p-3 flex flex-col gap-1 flex-1">
                    <p className="text-sm font-medium leading-tight line-clamp-2">{it.nome}</p>
                    <p className="text-[11px] text-zinc-500">{[it.marca, it.cor].filter(Boolean).join(' · ')}</p>
                    <p className="text-[11px] text-zinc-600">Tam: {it.tamanhos.join(' / ')}</p>
                    {it.combo && it.combo_texto && (
                      <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-1 leading-snug">⚡ {it.combo_texto}</p>
                    )}
                    <div className="mt-auto pt-1">
                      {desc > 0 && <p className="text-[11px] text-zinc-600 line-through">{fBRL(it.preco_venda)}</p>}
                      <p className="text-lg font-bold text-emerald-400 leading-tight">{fBRL(it.preco_oportunidade ?? it.preco_venda)}</p>
                    </div>
                    {mpAtivo && !it.combo ? (
                      <>
                        {it.tamanhos.length > 1 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {it.tamanhos.map(t => (
                              <button key={t} onClick={() => setTamSel(s => ({ ...s, [it.id]: t }))}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${tamSel[it.id] === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>{t}</button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => adicionar(it)}
                          className="mt-2 text-center text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg py-2 transition">
                          Adicionar
                        </button>
                      </>
                    ) : (
                      <a href={zap(it)} target="_blank" rel="noopener noreferrer"
                        className="mt-2 text-center text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg py-2 transition">
                        Quero essa
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {comoComprar && comoComprar.trim() && (
          <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="font-semibold text-sm mb-2">Como comprar</h2>
            <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{comoComprar}</p>
          </div>
        )}
        <p className="text-center text-xs text-zinc-700 mt-8 mb-24">Clube {nomeLoja} · ofertas por tempo limitado</p>
      </main>

      {/* Barra do carrinho */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full pl-5 pr-3 py-3 shadow-2xl transition">
          <span className="font-semibold text-sm">{cart.length} {cart.length === 1 ? 'item' : 'itens'} · {fBRL(total)}</span>
          <span className="bg-white/20 rounded-full px-3 py-1 text-sm font-bold">Ver carrinho</span>
        </button>
      )}

      {/* Carrinho */}
      {showCart && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold">Seu carrinho</h2>
              <button onClick={() => setShowCart(false)} className="text-zinc-500 hover:text-white text-sm">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">Carrinho vazio.</p>}
              {cart.map(c => (
                <div key={c.key} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{c.nome}</span>
                  <span className="text-emerald-400 font-semibold shrink-0">{fBRL(c.preco)}</span>
                  <button onClick={() => setCart(x => x.filter(i => i.key !== c.key))} className="text-zinc-500 hover:text-red-400 shrink-0 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-zinc-800 shrink-0 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total</span>
                <span className="text-xl font-bold text-emerald-400">{fBRL(total)}</span>
              </div>
              <button onClick={finalizar} disabled={comprando || cart.length === 0}
                className="w-full text-center text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg py-3 transition disabled:opacity-60">
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
