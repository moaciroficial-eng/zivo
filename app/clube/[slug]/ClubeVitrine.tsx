'use client'

type Item = {
  id: string
  nome: string
  marca: string | null
  cor: string | null
  preco_venda: number | null
  preco_oportunidade: number | null
  tamanhos: string[]
  foto: string | null
}

function fBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function ClubeVitrine({ nomeLoja, ownerPhone, itens }: { nomeLoja: string; ownerPhone: string | null; itens: Item[] }) {
  const zap = (it: Item) => {
    const fone = (ownerPhone ?? '').replace(/\D/g, '')
    const msg = encodeURIComponent(`Oi! Vi no Clube ${nomeLoja} e quero: ${it.nome}${it.marca ? ` (${it.marca})` : ''} — ${fBRL(it.preco_oportunidade)}`)
    return fone ? `https://wa.me/${fone.startsWith('55') ? fone : '55' + fone}?text=${msg}` : '#'
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur border-b border-zinc-800/60 px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <span className="text-xl">👑</span>
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
                    <div className="mt-auto pt-1">
                      {desc > 0 && <p className="text-[11px] text-zinc-600 line-through">{fBRL(it.preco_venda)}</p>}
                      <p className="text-lg font-bold text-emerald-400 leading-tight">{fBRL(it.preco_oportunidade ?? it.preco_venda)}</p>
                    </div>
                    <a href={zap(it)} target="_blank" rel="noopener noreferrer"
                      className="mt-2 text-center text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg py-2 transition">
                      Quero essa
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-center text-xs text-zinc-700 mt-8">Clube {nomeLoja} · ofertas por tempo limitado</p>
      </main>
    </div>
  )
}
