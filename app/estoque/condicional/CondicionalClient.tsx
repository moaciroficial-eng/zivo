'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MobileNav from '@/app/components/MobileNav'
import BarcodeScanner, { type ScanLabelResult } from '@/app/components/BarcodeScanner'
import type { Produto } from '../types'

/* ── Types ── */

type ProdutoCondicional = Produto & {
  condicional_com: string | null
  condicional_tel: string | null
  condicional_desde: string | null
}

/* ── Helpers ── */

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function diasDesde(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ── Icons ── */

const IconX = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 18 4 13"/>
  </svg>
)
const IconScan = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="17" y1="12" x2="17" y2="12.01"/>
  </svg>
)
const IconUser = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconArrowLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)
const IconPackage = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
)

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'

const NAV_LINKS = [
  { href: '/dashboard',            label: 'Dashboard'     },
  { href: '/clientes',             label: 'Clientes'      },
  { href: '/vendas',               label: 'Vendas'        },
  { href: '/calendario',           label: 'Calendário'    },
  { href: '/estoque',              label: 'Estoque'       },
  { href: '/biblioteca',           label: 'Biblioteca'    },
  { href: '/configuracoes/marcas', label: 'Configurações' },
]

/* ── Main component ── */

export default function CondicionalClient({
  user,
  initialProdutos,
}: {
  user: { id: string; email: string }
  initialProdutos: ProdutoCondicional[]
}) {
  const supabase = createClient()

  const [produtos, setProdutos] = useState<ProdutoCondicional[]>(initialProdutos)
  const [showScanner, setShowScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  /* modal enviar */
  const [modalEnviar, setModalEnviar] = useState<ProdutoCondicional | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTel, setClienteTel] = useState('')

  /* modal retornar */
  const [modalRetornar, setModalRetornar] = useState<ProdutoCondicional | null>(null)

  /* ── Toast ── */
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Scan handler ── */
  async function handleScan(barcode: string) {
    setShowScanner(false)
    setLoading(true)

    // Primeiro verifica nos produtos já carregados (em condicional)
    const jaNaLista = produtos.find(p => p.codigo_barras === barcode)
    if (jaNaLista) {
      setModalRetornar(jaNaLista)
      setLoading(false)
      return
    }

    // Busca no banco por qualquer produto com esse código
    const { data, error } = await supabase
      .from('estoque')
      .select('*')
      .eq('user_id', user.id)
      .eq('codigo_barras', barcode)
      .maybeSingle()

    setLoading(false)

    if (error || !data) {
      showToast('Produto não encontrado no estoque.', 'error')
      return
    }

    if (data.status === 'em_condicional') {
      setModalRetornar(data as ProdutoCondicional)
    } else if (data.status === 'disponivel') {
      setClienteNome('')
      setClienteTel('')
      setModalEnviar(data as ProdutoCondicional)
    } else {
      showToast(`Produto com status "${data.status}" não pode ir para condicional.`, 'error')
    }
  }

  /* ── Label scan (AI) ── */
  async function handleLabelScan(result: ScanLabelResult) {
    setShowScanner(false)
    if (!result.nome && !result.marca) { showToast('Não foi possível identificar o produto.', 'error'); return }

    // Busca por nome/marca
    const { data: lista } = await supabase
      .from('estoque')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['disponivel', 'em_condicional'])

    if (!lista?.length) { showToast('Nenhum produto correspondente.', 'error'); return }

    const nomeLow  = (result.nome  ?? '').toLowerCase()
    const marcaLow = (result.marca ?? '').toLowerCase()

    const scored = lista.map(item => {
      let score = 0
      const iNome  = item.nome.toLowerCase()
      const iMarca = (item.marca ?? '').toLowerCase()
      nomeLow.split(' ').filter((w: string) => w.length > 2).forEach((w: string) => { if (iNome.includes(w)) score += 2 })
      if (marcaLow && iMarca.includes(marcaLow)) score += 3
      return { item, score }
    }).filter((s: { item: unknown; score: number }) => s.score > 0).sort((a: { score: number }, b: { score: number }) => b.score - a.score)

    if (!scored.length) { showToast('Produto não encontrado pelo rótulo.', 'error'); return }

    const found = scored[0].item as ProdutoCondicional

    if (found.status === 'em_condicional') {
      setModalRetornar(found)
    } else {
      setClienteNome('')
      setClienteTel('')
      setModalEnviar(found)
    }
  }

  /* ── Enviar para condicional ── */
  async function handleEnviar() {
    if (!modalEnviar || !clienteNome.trim()) return
    setLoading(true)

    const { data, error } = await supabase
      .from('estoque')
      .update({
        status: 'em_condicional',
        condicional_com: clienteNome.trim(),
        condicional_tel: clienteTel.trim() || null,
        condicional_desde: new Date().toISOString(),
      })
      .eq('id', modalEnviar.id)
      .eq('user_id', user.id)
      .select()
      .single()

    setLoading(false)

    if (error || !data) { showToast('Erro ao enviar para condicional.', 'error'); return }

    setProdutos(ps => [...ps, data as ProdutoCondicional])
    setModalEnviar(null)
    showToast(`"${data.nome}" enviado para condicional com ${clienteNome.trim()}.`)
  }

  /* ── Retornar ao estoque ── */
  async function handleRetornar() {
    if (!modalRetornar) return
    setLoading(true)

    const { error } = await supabase
      .from('estoque')
      .update({
        status: 'disponivel',
        condicional_com: null,
        condicional_tel: null,
        condicional_desde: null,
      })
      .eq('id', modalRetornar.id)
      .eq('user_id', user.id)

    setLoading(false)

    if (error) { showToast('Erro ao retornar ao estoque.', 'error'); return }

    setProdutos(ps => ps.filter(p => p.id !== modalRetornar.id))
    showToast(`"${modalRetornar.nome}" voltou ao estoque.`)
    setModalRetornar(null)
  }

  /* ── Derived ── */
  const porCliente = new Map<string, ProdutoCondicional[]>()
  for (const p of produtos) {
    const key = p.condicional_com ?? 'Desconhecido'
    const arr = porCliente.get(key) ?? []
    arr.push(p)
    porCliente.set(key, arr)
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-20 md:pb-0">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="3" fill="white"/>
                </svg>
              </div>
              <span className="font-bold">zivo</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {NAV_LINKS.map(l => (
                <Link key={l.href} href={l.href} className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">{l.label}</Link>
              ))}
              <span className="text-zinc-700 select-none">/</span>
              <span className="px-3 py-1.5 font-medium bg-zinc-800 rounded-lg">Condicional</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition cursor-pointer">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Title + scan button */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/estoque" className="text-zinc-500 hover:text-zinc-300 transition">
                <IconArrowLeft />
              </Link>
              <h1 className="text-2xl font-bold">Condicional</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              {produtos.length} {produtos.length === 1 ? 'peça' : 'peças'} com {porCliente.size} {porCliente.size === 1 ? 'cliente' : 'clientes'}
            </p>
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl px-5 py-2.5 transition cursor-pointer shadow-lg shadow-violet-500/20"
          >
            <IconScan /> Escanear
          </button>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Buscando produto...
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-xl px-4 py-2.5 border ${
            toast.type === 'success'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck size={15}/> : <IconX size={15}/>}
            {toast.msg}
          </div>
        )}

        {/* Empty */}
        {produtos.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <IconPackage size={24} />
            </div>
            <p className="font-medium text-zinc-300">Nenhuma peça em condicional</p>
            <p className="text-zinc-500 text-sm max-w-xs">Escaneie o código de barras de uma peça para enviá-la para condicional.</p>
            <button
              onClick={() => setShowScanner(true)}
              className="mt-2 flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl px-5 py-2.5 transition cursor-pointer"
            >
              <IconScan /> Escanear peça
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(porCliente.entries()).map(([cliente, itens]) => {
              const diasMax = Math.max(...itens.map(p => diasDesde(p.condicional_desde)))
              return (
                <div key={cliente} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

                  {/* Cliente header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-sm font-bold text-violet-300 shrink-0">
                        {cliente.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{cliente}</p>
                        {itens[0].condicional_tel && (
                          <p className="text-xs text-zinc-500">{itens[0].condicional_tel}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-zinc-300">{itens.length} {itens.length === 1 ? 'peça' : 'peças'}</p>
                      <p className={`text-xs mt-0.5 ${diasMax > 7 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {diasMax === 0 ? 'hoje' : `${diasMax}d fora`}
                      </p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-zinc-800/60">
                    {itens.map(p => {
                      const dias = diasDesde(p.condicional_desde)
                      return (
                        <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-4 hover:bg-white/[0.02] transition group">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.nome}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {p.marca && <span className="text-xs text-zinc-500">{p.marca}</span>}
                              {p.preco_venda != null && <span className="text-xs text-emerald-400">{formatBRL(p.preco_venda)}</span>}
                              <span className="text-xs text-zinc-600">saiu {formatDate(p.condicional_desde)}</span>
                              {dias > 0 && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${dias > 7 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                  {dias}d
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setModalRetornar(p)}
                            className="shrink-0 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition cursor-pointer opacity-0 group-hover:opacity-100"
                          >
                            Retornar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Modal Enviar para Condicional ── */}
      {modalEnviar && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalEnviar(null)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Enviar para condicional</h2>
              <button onClick={() => setModalEnviar(null)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                <IconX />
              </button>
            </div>

            {/* Produto info */}
            <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3">
              <p className="font-medium text-sm">{modalEnviar.nome}</p>
              {modalEnviar.marca && <p className="text-xs text-zinc-500 mt-0.5">{modalEnviar.marca}</p>}
              {modalEnviar.preco_venda != null && (
                <p className="text-sm font-semibold text-emerald-400 mt-1">{formatBRL(modalEnviar.preco_venda)}</p>
              )}
            </div>

            {/* Campos */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                  <IconUser /> Com quem vai? *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={clienteNome}
                  onChange={e => setClienteNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && clienteNome.trim() && handleEnviar()}
                  placeholder="Nome do cliente"
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">WhatsApp (opcional)</label>
                <input
                  type="tel"
                  value={clienteTel}
                  onChange={e => setClienteTel(e.target.value)}
                  placeholder="5511999999999"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalEnviar(null)}
                className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviar}
                disabled={!clienteNome.trim() || loading}
                className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 rounded-xl py-3 transition cursor-pointer"
              >
                {loading ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Retornar ao Estoque ── */}
      {modalRetornar && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalRetornar(null)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Retornar ao estoque</h2>
              <button onClick={() => setModalRetornar(null)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                <IconX />
              </button>
            </div>

            <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3">
              <p className="font-medium text-sm">{modalRetornar.nome}</p>
              {modalRetornar.marca && <p className="text-xs text-zinc-500 mt-0.5">{modalRetornar.marca}</p>}
              {modalRetornar.preco_venda != null && (
                <p className="text-sm font-semibold text-emerald-400 mt-1">{formatBRL(modalRetornar.preco_venda)}</p>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
              <p className="text-sm text-amber-300 font-medium flex items-center gap-1.5">
                <IconUser /> Com {modalRetornar.condicional_com ?? 'cliente'}
              </p>
              {modalRetornar.condicional_desde && (
                <p className="text-xs text-zinc-500">
                  Desde {formatDate(modalRetornar.condicional_desde)} · {diasDesde(modalRetornar.condicional_desde)}d fora
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalRetornar(null)}
                className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleRetornar}
                disabled={loading}
                className="flex-1 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl py-3 transition cursor-pointer"
              >
                {loading ? 'Retornando...' : 'Peça retornou ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          onLabelScan={handleLabelScan}
        />
      )}

      <MobileNav />
    </div>
  )
}
