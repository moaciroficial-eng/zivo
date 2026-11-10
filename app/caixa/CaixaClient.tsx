'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Linha = {
  id: string; nome: string; marca: string | null; cor: string | null; foto: string | null
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
type ClienteCasado = { clienteId: string; nome: string; telefone: string | null; tamanho: string; motivo: string; copy: string }

const fBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const chave = (l: Linha) => `${l.id}-${l.tamanho}`

export default function CaixaClient() {
  const router = useRouter()
  const [meta, setMeta] = useState(10000)
  const [carregando, setCarregando] = useState(false)
  const [plano, setPlano] = useState<Plano | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [dispensados, setDispensados] = useState<Set<string>>(new Set())

  /* Ver clientes com perfil pras peças mantidas */
  const [verClientesOpen, setVerClientesOpen] = useState(false)
  const [carregandoClientes, setCarregandoClientes] = useState(false)
  const [clientesCasados, setClientesCasados] = useState<(ClienteCasado & { produtoNome: string })[]>([])

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

  /* ── Exportar lista (CSV, direto no navegador) ── */
  function exportarCSV() {
    const linhas = [
      ['Produto', 'Marca', 'Cor', 'Tamanho', 'Qtd', 'Preço cheio', 'Desconto', 'Preço promo', 'Total'],
      ...mantidos.map(l => [l.nome, l.marca ?? '', l.cor ?? '', l.tamanho, String(l.qtd), String(l.preco_venda), `${l.desconto}%`, String(l.preco_promo), String(l.valor)]),
    ]
    const csv = linhas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `levantar-caixa-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /* ── Criar campanha com essas peças (entrega pra consultora de /campanhas) ── */
  function criarCampanha() {
    const porProduto = new Map<string, { nome: string; marca: string | null; cor: string | null; preco: number; tamanhos: Set<string>; id: string }>()
    for (const l of mantidos) {
      const atual = porProduto.get(l.id) ?? { nome: l.nome, marca: l.marca, cor: l.cor, preco: l.preco_promo, tamanhos: new Set<string>(), id: l.id }
      atual.tamanhos.add(l.tamanho)
      porProduto.set(l.id, atual)
    }
    const produtos = [...porProduto.values()]
    const linhasTexto = produtos.map((p, i) => {
      const attrs = [p.marca, p.cor].filter(Boolean).join(', ')
      return `${i + 1}) ${p.nome}${attrs ? ` (${attrs})` : ''} — vender tamanhos ${[...p.tamanhos].join(', ')} — R$ ${p.preco.toFixed(2).replace('.', ',')}`
    }).join('\n')
    const texto = `Selecionei essas peças do Levantar Caixa pra girar (estoque parado):\n${linhasTexto}\nMonta a campanha em cima desses produtos.`
    try {
      sessionStorage.setItem('terny:campanha-prefill', JSON.stringify({ texto, produtoIds: produtos.map(p => p.id) }))
    } catch { /* segue mesmo sem sessionStorage */ }
    router.push('/campanhas')
  }

  /* ── Ver clientes com perfil pras peças mantidas ── */
  async function verClientes() {
    setVerClientesOpen(true)
    if (clientesCasados.length > 0 || carregandoClientes) return
    setCarregandoClientes(true)
    try {
      const idsUnicos = [...new Set(mantidos.map(l => l.id))]
      const porId = new Map(mantidos.map(l => [l.id, l]))
      const resultados = await Promise.all(idsUnicos.map(async (produtoId) => {
        const l = porId.get(produtoId)!
        const res = await fetch('/api/plano/produto-clientes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produtoId, produtoNome: l.nome, marca: l.marca }),
        })
        const d = await res.json().catch(() => ({}))
        const clientes = (d?.clientes ?? []) as ClienteCasado[]
        return clientes.map(c => ({ ...c, produtoNome: d?.nomeLimpo || l.nome }))
      }))
      setClientesCasados(resultados.flat())
    } catch { /* fica vazio */ }
    finally { setCarregandoClientes(false) }
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h1 className="text-2xl font-bold">Levantar Caixa</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6 max-w-2xl">
A IA cruza o que <b className="text-zinc-300">mais vende</b> (histórico) com o que está <b className="text-zinc-300">parado</b>: já <b className="text-zinc-300">tira da queima os tamanhos bons vendedores</b> (ficam no preço cheio) e lista só o encalhe. <b className="text-zinc-300">Cada linha é uma peça + tamanho</b> — dá um <b className="text-zinc-300">×</b> pra dispensar o que não faz sentido. Só produtos com +60 dias de nota (cadastro manual = estoque antigo), desconto até 50%, nunca abaixo do custo. O plano para perto da meta, não passa muito dela.
        </p>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quanto você quer levantar?</label>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-zinc-500 text-lg">R$</span>
              <input type="number" min={0} step={500} value={meta}
                onChange={e => setMeta(Math.max(0, Number(e.target.value)))}
                className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg font-bold outline-none focus:border-[#C79A54]" />
            </div>
          </div>
          <button onClick={gerar} disabled={carregando}
            className="px-5 py-2.5 bg-gradient-to-r from-[#C79A54] to-[#A67C3D] hover:from-[#C79A54] hover:to-[#A67C3D] disabled:opacity-50 text-[#16151A] font-semibold rounded-lg transition cursor-pointer">
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
                <div className="h-full bg-gradient-to-r from-[#C79A54] to-emerald-500 transition-all" style={{ width: `${pctMeta}%` }} />
              </div>
              {plano.resumo.tamanhos_protegidos.length > 0 && (
                <p className="text-[11px] text-zinc-500 mt-3">🛡️ Já tirei da queima (você vende bem, giro alto): {plano.resumo.tamanhos_protegidos.map(t => (
                  <span key={t} className="inline-block text-[10px] font-bold bg-[#C79A54]/20 text-[#F0CC88] px-1.5 py-0.5 rounded-full ml-1">{t}</span>
                ))}</p>
              )}
            </div>

            {plano.itens.length === 0 ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center text-zinc-400">
                Nenhuma peça com +60 dias e margem pra desconto. Seu estoque está girando bem! 🎉
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {plano.itens.map(l => {
                    const k = chave(l)
                    const fora = dispensados.has(k)
                    return (
                      <div key={k} className={`border rounded-xl px-3 py-3 flex items-center gap-3 transition ${fora ? 'border-zinc-800/50 bg-zinc-900/30 opacity-45' : 'border-zinc-800 bg-zinc-900/60'}`}>
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                          {l.foto ? <img src={l.foto} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-lg">👕</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.escasso ? 'bg-[#C79A54]/15 text-[#E0B36A] border border-[#C79A54]/30' : 'bg-zinc-800 text-zinc-300'}`}>{l.tamanho}{l.escasso ? ' 🛡️' : ''}</span>
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

                {/* Ações */}
                {mantidos.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 mt-5">
                    <button onClick={criarCampanha}
                      className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-[#C79A54] to-[#A67C3D] hover:from-[#C79A54] hover:to-[#A67C3D] text-[#16151A] rounded-lg px-4 py-2.5 transition cursor-pointer">
                      🎯 Criar campanha com essas peças
                    </button>
                    <button onClick={verClientes}
                      className="flex items-center gap-2 text-sm font-semibold text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2.5 transition cursor-pointer">
                      👥 Ver clientes com perfil
                    </button>
                    <button onClick={exportarCSV}
                      className="flex items-center gap-2 text-sm font-semibold text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2.5 transition cursor-pointer">
                      📄 Exportar lista
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Modal: clientes com perfil pras peças mantidas */}
      {verClientesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setVerClientesOpen(false)}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-white">Clientes com perfil pras peças</h3>
              <button onClick={() => setVerClientesOpen(false)} className="text-zinc-500 hover:text-white transition cursor-pointer p-1">✕</button>
            </div>
            <p className="text-xs text-zinc-500 mb-4">Pra mandar mensagem de verdade, use o Painel ou a aba IA.</p>
            {carregandoClientes ? (
              <p className="text-sm text-zinc-500 text-center py-8">Cruzando perfil dos clientes…</p>
            ) : clientesCasados.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">Nenhum cliente com perfil forte pra essas peças agora.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {clientesCasados.map((c, i) => (
                  <div key={`${c.clienteId}-${i}`} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold">{c.nome} <span className="text-zinc-500 font-normal">→ {c.produtoNome} {c.tamanho}</span></p>
                    <p className="text-xs text-zinc-500 mt-0.5">{c.motivo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
