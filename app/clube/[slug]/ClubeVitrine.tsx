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

export default function ClubeVitrine({ nomeLoja, logo, comoComprar, ownerPhone, slug, email, mpAtivo, itens }: { nomeLoja: string; logo: string | null; comoComprar: string | null; ownerPhone: string | null; slug: string; email: string; mpAtivo: boolean; itens: Item[] }) {
  const [comprando, setComprando] = useState<string | null>(null)

  const zap = (it: Item) => {
    const fone = (ownerPhone ?? '').replace(/\D/g, '')
    const cond = it.combo && it.combo_texto ? ` (combo: ${it.combo_texto})` : ''
    const msg = encodeURIComponent(`Oi! Vi no Clube ${nomeLoja} e quero: ${it.nome}${it.marca ? ` (${it.marca})` : ''} — ${fBRL(it.preco_oportunidade)}${cond}`)
    return fone ? `https://wa.me/${fone.startsWith('55') ? fone : '55' + fone}?text=${msg}` : '#'
  }

  async function comprar(it: Item) {
    setComprando(it.id)
    try {
      const res = await fetch('/api/clube/comprar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, estoqueId: it.id, tamanho: it.tamanhos[0] ?? null, email }),
      })
      const d = await res.json().catch(() => ({}))
      if (d?.ok && d.url) { window.location.href = d.url }
      else { alert(d?.erro || 'Não foi possível iniciar o pagamento.'); setComprando(null) }
    } catch { alert('Falha ao iniciar o pagamento.'); setComprando(null) }
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
                      <button onClick={() => comprar(it)} disabled={comprando === it.id}
                        className="mt-2 text-center text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg py-2 transition disabled:opacity-60">
                        {comprando === it.id ? 'Abrindo...' : 'Comprar'}
                      </button>
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
        <p className="text-center text-xs text-zinc-700 mt-8">Clube {nomeLoja} · ofertas por tempo limitado</p>
      </main>
    </div>
  )
}
