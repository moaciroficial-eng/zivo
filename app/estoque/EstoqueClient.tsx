'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MobileNav from '@/app/components/MobileNav'
import type { Produto } from './types'
import SugestoesWidget from './_components/SugestoesWidget'
import ImportNFeModal from './_components/ImportNFeModal'

export type { Produto }

/* ── Types ── */

type TamanhoQtd = { tamanho: string; qtd: number }
type Categoria = Produto['categoria'] | 'todos'

/* ── Constants ── */

const CAT_LABEL: Record<Produto['categoria'], string> = {
  camiseta: 'Camiseta',
  regata:   'Regata',
  calca:    'Calça',
  tenis:    'Tênis',
  outros:   'Outros',
}

const CAT_COLOR: Record<Produto['categoria'], string> = {
  camiseta: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  regata:   'bg-rose-500/15 text-rose-300 border-rose-500/25',
  calca:    'bg-blue-500/15 text-blue-300 border-blue-500/25',
  tenis:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  outros:   'bg-zinc-700/50 text-zinc-300 border-zinc-600',
}

const NAV_LINKS = [
  { href: '/dashboard',            label: 'Dashboard'     },
  { href: '/clientes',             label: 'Clientes'      },
  { href: '/vendas',               label: 'Vendas'        },
  { href: '/calendario',           label: 'Calendário'    },
  { href: '/estoque',              label: 'Estoque'       },
  { href: '/configuracoes/marcas', label: 'Configurações' },
]

/* ── Helpers ── */

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function calcMargem(custo: number | null, venda: number | null) {
  if (!custo || !venda || custo === 0) return null
  return ((venda - custo) / custo * 100).toFixed(0)
}

function totalQtd(tamanhos: TamanhoQtd[]) {
  return tamanhos.reduce((s, t) => s + t.qtd, 0)
}

function stockStatus(tamanhos: TamanhoQtd[]): 'ok' | 'low' | 'out' {
  if (!tamanhos.length) return 'out'
  if (tamanhos.some(t => t.qtd === 0)) return 'out'
  if (tamanhos.some(t => t.qtd <= 2))  return 'low'
  return 'ok'
}

/* ── Sub-components ── */

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? ''}`}>{value}</p>
    </div>
  )
}

/* ── Icons ── */

const IconPlus   = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IconNFe    = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
const IconEdit   = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash  = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconX      = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck  = ({ size = 14 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

/* ── Main component ── */

export default function EstoqueClient({
  user,
  initialProdutos,
}: {
  user: { id: string; email: string }
  initialProdutos: Produto[]
}) {
  const supabase = createClient()
  const [produtos, setProdutos] = useState(initialProdutos)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [catFiltro, setCatFiltro] = useState<Categoria>('todos')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [showNFeModal, setShowNFeModal] = useState(false)

  /* ── Toast ── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Delete ── */

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('estoque').delete().eq('id', id)
    if (!error) { setProdutos(ps => ps.filter(p => p.id !== id)); showToast('Produto removido.') }
    else showToast(error.message, 'error')
    setDeleting(null); setConfirmDelete(null)
  }

  /* ── CSV ── */

  function handleCSVChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split(/\r?\n/)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const rows = lines.slice(1)
        .map(line => {
          const vals = line.split(',')
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim().replace(/"/g, '') })
          return obj
        })
        .filter(r => r['nome'] && r['categoria'])

      if (!rows.length) { showToast('Nenhum dado válido encontrado.', 'error'); return }

      const validCats = ['camiseta', 'calca', 'tenis', 'outros']
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const inserts = rows.filter(r => validCats.includes(r['categoria'])).map(r => {
        const cat = r['categoria'] as Produto['categoria']
        let tamanhos: TamanhoQtd[] = []
        if (cat === 'outros') {
          tamanhos = [{ tamanho: 'UN', qtd: Number(r['qtd']) || 0 }]
        } else if (r['tamanhos']) {
          tamanhos = r['tamanhos'].split(';').map(p => {
            const [tam, qtd] = p.split(':')
            return { tamanho: tam?.trim() ?? '', qtd: Number(qtd) || 0 }
          }).filter(t => t.tamanho)
        }
        return {
          user_id: authUser?.id,
          nome: r['nome'],
          marca: r['marca'] || null,
          categoria: cat,
          tamanhos,
          preco_custo: r['preco_custo'] ? Number(r['preco_custo'].replace(',', '.')) : null,
          preco_venda: r['preco_venda'] ? Number(r['preco_venda'].replace(',', '.')) : null,
        }
      })

      if (!inserts.length) { showToast('Nenhuma linha com categoria válida.', 'error'); return }

      const { data, error } = await supabase.from('estoque').insert(inserts).select()
      if (error) { showToast(`Erro: ${error.message}`, 'error'); return }
      setProdutos(ps => [...ps, ...(data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome)))
      showToast(`${data?.length ?? 0} produto(s) importado(s).`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  /* ── Derived ── */

  const filtered = produtos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.marca ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCat = catFiltro === 'todos' || p.categoria === catFiltro
    return matchSearch && matchCat
  })

  const totalPecas  = produtos.reduce((s, p) => s + totalQtd(p.tamanhos), 0)
  const valorCusto  = produtos.reduce((s, p) => s + totalQtd(p.tamanhos) * (p.preco_custo ?? 0), 0)
  const valorVenda  = produtos.reduce((s, p) => s + totalQtd(p.tamanhos) * (p.preco_venda ?? 0), 0)
  const lowStockCount = produtos.filter(p => stockStatus(p.tamanhos) !== 'ok').length

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-20 md:pb-0">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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
                l.href === '/estoque'
                  ? <span key={l.href} className="px-3 py-1.5 font-medium bg-zinc-800 rounded-lg">{l.label}</span>
                  : <Link key={l.href} href={l.href} className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">{l.label}</Link>
              ))}
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

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Title + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Estoque</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{produtos.length} produto{produtos.length !== 1 ? 's' : ''} cadastrado{produtos.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvInput} type="file" accept=".csv" className="hidden" onChange={handleCSVChange} />
            <button
              onClick={() => csvInput.current?.click()}
              className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg px-4 py-2 transition cursor-pointer"
            >
              <IconUpload /> Importar CSV
            </button>
            <button
              onClick={() => setShowNFeModal(true)}
              className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg px-4 py-2 transition cursor-pointer"
            >
              <IconNFe /> Importar NF-e
            </button>
            <Link
              href="/estoque/novo"
              className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 transition shadow-lg shadow-violet-500/20"
            >
              <IconPlus /> Novo Produto
            </Link>
          </div>
        </div>

        {/* Badge de recebimento pendente */}
        {(() => {
          const pending = produtos.filter(p => p.status === 'aguardando_recebimento')
          if (!pending.length) return null
          return (
            <div className="mb-4 flex items-center justify-between gap-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="flex items-center gap-2.5 text-sm text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"/>
                {pending.length} produto{pending.length !== 1 ? 's' : ''} aguardando conferência de recebimento
              </div>
              <Link href="/estoque/recebimento" className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition whitespace-nowrap">
                Conferir →
              </Link>
            </div>
          )
        })()}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Produtos"       value={String(produtos.length)} />
          <StatCard label="Peças em Stock" value={String(totalPecas)} />
          <StatCard label="Valor de Custo" value={formatBRL(valorCusto)} />
          <StatCard label="Valor de Venda" value={formatBRL(valorVenda)} accent="text-emerald-400" />
        </div>

        {/* Sugestões IA */}
        {produtos.length > 0 && (
          <SugestoesWidget
            produtos={produtos}
            onProdutoUpdate={(id, patch) =>
              setProdutos(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p))
            }
          />
        )}

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border ${
            toast.type === 'success'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck size={15}/> : <IconX size={15}/>}
            {toast.msg}
          </div>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {(['todos', 'camiseta', 'calca', 'tenis', 'outros'] as Categoria[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCatFiltro(cat)}
                className={`px-3 py-1.5 text-sm rounded-lg transition cursor-pointer capitalize ${
                  catFiltro === cat ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {cat === 'todos' ? 'Todos' : CAT_LABEL[cat as Produto['categoria']]}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><IconSearch /></span>
            <input
              type="text"
              placeholder="Buscar produto ou marca..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
            />
          </div>
          {lowStockCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 ml-auto">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>
              {lowStockCount} produto{lowStockCount !== 1 ? 's' : ''} com estoque baixo
            </div>
          )}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
            </div>
            {search || catFiltro !== 'todos' ? (
              <>
                <p className="font-medium text-zinc-300">Nenhum resultado encontrado</p>
                <button onClick={() => { setSearch(''); setCatFiltro('todos') }} className="text-sm text-violet-400 hover:text-violet-300 transition">Limpar filtros</button>
              </>
            ) : (
              <>
                <p className="font-medium text-zinc-300">Nenhum produto no estoque</p>
                <p className="text-zinc-500 text-sm">Adicione o primeiro produto ou importe via CSV.</p>
                <Link href="/estoque/novo" className="mt-2 inline-block text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-5 py-2 transition">Novo Produto</Link>
              </>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Produto</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Categoria</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Tamanhos / Qtd</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Custo</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Venda</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Margem</th>
                    <th className="px-4 py-3 w-24"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filtered.map(p => {
                    const status = stockStatus(p.tamanhos)
                    const margem = calcMargem(p.preco_custo, p.preco_venda)
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.025] transition group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-8 rounded-full shrink-0 ${
                              status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}/>
                            <div>
                              <p className="font-medium">{p.nome}</p>
                              {p.marca && <p className="text-xs text-zinc-500">{p.marca}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded border text-xs font-medium ${CAT_COLOR[p.categoria]}`}>
                            {CAT_LABEL[p.categoria]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {(p.tamanhos ?? []).map(t => {
                              const s = t.qtd === 0 ? 'text-red-300 bg-red-500/10 border-red-500/20'
                                      : t.qtd <= 2  ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                                                    : 'text-zinc-300 bg-zinc-800 border-zinc-700'
                              return (
                                <span key={t.tamanho} className={`px-1.5 py-0.5 border rounded text-xs font-medium ${s}`}>
                                  {t.tamanho === 'UN' ? '' : `${t.tamanho} `}×{t.qtd}
                                </span>
                              )
                            })}
                            {!p.tamanhos?.length && <span className="text-zinc-700">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatBRL(p.preco_custo)}</td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{formatBRL(p.preco_venda)}</td>
                        <td className="px-4 py-3">
                          {margem != null ? (
                            <span className={`text-xs font-semibold ${Number(margem) >= 50 ? 'text-emerald-400' : Number(margem) >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                              {margem}%
                            </span>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 h-6">
                            {confirmDelete === p.id ? (
                              <>
                                <span className="text-xs text-zinc-400 mr-1 whitespace-nowrap">Excluir?</span>
                                <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer disabled:opacity-50"><IconCheck /></button>
                                <button onClick={() => setConfirmDelete(null)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX size={14}/></button>
                              </>
                            ) : (
                              <>
                                <Link href={`/estoque/${p.id}/editar`} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition opacity-0 group-hover:opacity-100"><IconEdit /></Link>
                                <button onClick={() => setConfirmDelete(p.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100"><IconTrash /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-700 mt-4 font-mono">
          CSV: nome, marca, categoria, tamanhos, preco_custo, preco_venda &nbsp;·&nbsp; tamanhos: <span className="text-zinc-600">P:5;M:10;G:8</span> &nbsp;·&nbsp; outros: use coluna qtd
        </p>
      </main>

      {showNFeModal && (
        <ImportNFeModal
          userId={user.id}
          onSuccess={(newProdutos, _grupoId) => {
            setProdutos(ps => [...ps, ...newProdutos].sort((a, b) => a.nome.localeCompare(b.nome)))
            setShowNFeModal(false)
            showToast(`${newProdutos.length} produto${newProdutos.length !== 1 ? 's' : ''} importado${newProdutos.length !== 1 ? 's' : ''} · Aguardando conferência.`)
          }}
          onClose={() => setShowNFeModal(false)}
        />
      )}
      <MobileNav />
    </div>
  )
}
