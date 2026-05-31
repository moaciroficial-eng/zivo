'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'

/* ── Types ─────────────────────────────────────────────────── */

type Produto = { nome: string; qtd: number }

type Venda = {
  id: string
  user_id: string
  cliente_id: string | null
  cliente_nome: string
  valor: number
  data_venda: string
  produtos: Produto[]
  created_at: string
}

type ClienteOption = { id: string; nome: string }

type FormProduto = { nome: string; qtd: string }

type FormState = {
  clienteSearch: string
  clienteId: string
  clienteNome: string
  valor: string
  dataVenda: string
  produtos: FormProduto[]
}

/* ── Constants ──────────────────────────────────────────────── */

const TODAY = new Date().toISOString().split('T')[0]

const EMPTY: FormState = {
  clienteSearch: '', clienteId: '', clienteNome: '',
  valor: '', dataVenda: TODAY, produtos: [],
}

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]'

/* ── Helpers ────────────────────────────────────────────────── */

function formatDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

function parseProdutos(raw: unknown): Produto[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as Produto[]
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed as Produto[] : []
      } catch {
        return []
      }
    }
    return s.split(';').map(p => {
      const [nome, qtd] = p.split(':')
      return { nome: nome?.trim() ?? p.trim(), qtd: Number(qtd) || 1 }
    }).filter(p => p.nome)
  }
  return []
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/* ── Small components ───────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ── Icons ──────────────────────────────────────────────────── */

const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconX = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck = ({ size = 14 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconUser = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconPackage = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>

/* ── Main component ─────────────────────────────────────────── */

export default function VendasClient({
  user,
  initialVendas,
  clientes,
}: {
  user: { id: string; email: string }
  initialVendas: Venda[]
  clientes: ClienteOption[]
}) {
  const supabase = createClient()
  const [vendas, setVendas] = useState(initialVendas)
  const [drawer, setDrawer] = useState(false)
  const [editing, setEditing] = useState<Venda | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [clienteDropdown, setClienteDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)

  /* ── Cliente autocomplete ── */

  const clientesFiltrados = form.clienteSearch.length >= 1
    ? clientes.filter(c => c.nome.toLowerCase().includes(form.clienteSearch.toLowerCase())).slice(0, 7)
    : []

  function selectCliente(c: ClienteOption) {
    setForm(f => ({ ...f, clienteSearch: c.nome, clienteId: c.id, clienteNome: c.nome }))
    setClienteDropdown(false)
  }

  function handleClienteInput(val: string) {
    setForm(f => ({ ...f, clienteSearch: val, clienteId: '', clienteNome: val }))
    setClienteDropdown(true)
  }

  /* ── Produtos ── */

  function addProduto() {
    setForm(f => ({ ...f, produtos: [...f.produtos, { nome: '', qtd: '1' }] }))
  }

  function removeProduto(i: number) {
    setForm(f => ({ ...f, produtos: f.produtos.filter((_, idx) => idx !== i) }))
  }

  function setProdutoField(i: number, key: keyof FormProduto, val: string) {
    setForm(f => ({ ...f, produtos: f.produtos.map((p, idx) => idx === i ? { ...p, [key]: val } : p) }))
  }

  /* ── Toast ── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Drawer ── */

  function openNew() {
    setEditing(null); setForm(EMPTY); setFormError(''); setClienteDropdown(false); setDrawer(true)
  }

  function openEdit(v: Venda) {
    setEditing(v)
    setForm({
      clienteSearch: v.cliente_nome,
      clienteId: v.cliente_id ?? '',
      clienteNome: v.cliente_nome,
      valor: String(v.valor),
      dataVenda: v.data_venda,
      produtos: (v.produtos ?? []).map(p => ({ nome: p.nome, qtd: String(p.qtd) })),
    })
    setFormError(''); setClienteDropdown(false); setDrawer(true)
  }

  function closeDrawer() {
    setDrawer(false); setEditing(null); setFormError(''); setClienteDropdown(false)
  }

  /* ── Save ── */

  async function handleSave() {
    if (!form.clienteNome.trim()) { setFormError('Informe o nome do cliente.'); return }
    if (!form.valor || isNaN(Number(form.valor)) || Number(form.valor) <= 0) { setFormError('Informe um valor válido.'); return }
    if (!form.dataVenda) { setFormError('Informe a data da venda.'); return }
    setSaving(true); setFormError('')

    const payload = {
      cliente_id: form.clienteId || null,
      cliente_nome: form.clienteNome.trim(),
      valor: Number(form.valor),
      data_venda: form.dataVenda,
      produtos: form.produtos.filter(p => p.nome.trim()).map(p => ({ nome: p.nome.trim(), qtd: Number(p.qtd) || 1 })),
    }

    if (editing) {
      const { data, error } = await supabase.from('vendas').update(payload).eq('id', editing.id).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setVendas(vs => vs.map(v => v.id === editing.id ? data : v))
      showToast('Venda atualizada.')
    } else {
      const { data, error } = await supabase.from('vendas').insert(payload).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setVendas(vs => [data, ...vs])
      showToast('Venda adicionada.')
    }
    setSaving(false); closeDrawer()
  }

  /* ── CSV import ── */

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
        .filter(r => r['cliente_nome'] && r['valor'])

      if (!rows.length) { showToast('Nenhum dado válido encontrado no CSV.', 'error'); return }

      const inserts = rows.map(r => {
        // produtos aceita "nome1:qtd1;nome2:qtd2" ou texto livre
        const produtosRaw = r['produtos'] ?? ''
        const produtos: Produto[] = produtosRaw
          ? produtosRaw.split(';').map(p => {
              const [nome, qtd] = p.split(':')
              return { nome: nome?.trim() ?? p.trim(), qtd: Number(qtd) || 1 }
            }).filter(p => p.nome)
          : []

        return {
          cliente_nome: r['cliente_nome'],
          cliente_id: null,
          valor: Number(r['valor'].replace(',', '.')) || 0,
          data_venda: r['data_venda'] || new Date().toISOString().split('T')[0],
          produtos,
        }
      }).filter(r => r.valor > 0)

      if (!inserts.length) { showToast('Nenhuma venda com valor válido encontrada.', 'error'); return }

      const { data, error } = await supabase.from('vendas').insert(inserts).select()
      if (error) { showToast(`Erro na importação: ${error.message}`, 'error'); return }
      setVendas(vs => [...(data ?? []), ...vs])
      showToast(`${data?.length ?? 0} venda(s) importada(s) com sucesso.`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  /* ── Delete ── */

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('vendas').delete().eq('id', id)
    if (!error) { setVendas(vs => vs.filter(v => v.id !== id)); showToast('Venda removida.') }
    else showToast(error.message, 'error')
    setDeleting(null); setConfirmDelete(null)
  }

  /* ── Derived ── */

  const filtered = vendas.filter(v =>
    v.cliente_nome.toLowerCase().includes(search.toLowerCase())
  )

  const totalReceita = vendas.reduce((s, v) => s + Number(v.valor), 0)
  const ticketMedio = vendas.length > 0 ? totalReceita / vendas.length : 0

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/dashboard" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Dashboard</Link>
              <Link href="/clientes" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Clientes</Link>
              <Link href="/calendario" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Calendário</Link>
              <Link href="/estoque" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Estoque</Link>
              <Link href="/configuracoes/marcas" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Configurações</Link>
              <span className="text-zinc-700 select-none">/</span>
              <span className="px-3 py-1.5 font-medium bg-zinc-800 rounded-lg">Vendas</span>
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

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Title + action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Vendas</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{vendas.length} venda{vendas.length !== 1 ? 's' : ''} registrada{vendas.length !== 1 ? 's' : ''}</p>
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
              onClick={openNew}
              onTouchEnd={(e) => { e.preventDefault(); openNew(); }}
              className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 transition cursor-pointer shadow-lg shadow-violet-500/20"
            >
              <IconPlus /> Nova Venda
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label="Total de Vendas" value={String(vendas.length)} />
          <StatCard label="Receita Total" value={formatBRL(totalReceita)} />
          <StatCard label="Ticket Médio" value={vendas.length > 0 ? formatBRL(ticketMedio) : '—'} />
        </div>

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

        {/* Search */}
        <div className="mb-5">
          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><IconSearch /></span>
            <input
              type="text"
              placeholder="Buscar por cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
            />
          </div>
        </div>

        {/* Table / Empty */}
        {filtered.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            {search ? (
              <>
                <p className="font-medium text-zinc-300">Nenhuma venda para &quot;{search}&quot;</p>
                <button onClick={() => setSearch('')} className="text-sm text-violet-400 hover:text-violet-300 transition">Limpar busca</button>
              </>
            ) : (
              <>
                <p className="font-medium text-zinc-300">Nenhuma venda ainda</p>
                <p className="text-zinc-500 text-sm">Registre a primeira venda do seu negócio.</p>
                <button onClick={openNew} className="mt-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-5 py-2 transition cursor-pointer">
                  Nova Venda
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {['Cliente', 'Valor', 'Data', 'Produtos', ''].map(h => (
                      <th key={h} className={`text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 ${h === '' ? '' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filtered.map(v => {
                    const prods = parseProdutos(v.produtos)
                    const extras = prods.length - 1
                    const prodLabel = prods.length === 0 ? null
                      : prods.length === 1 ? prods[0].nome
                      : `${prods[0].nome} +${extras} ${extras === 1 ? 'item' : 'itens'}`
                    return (
                      <tr key={v.id} className="hover:bg-white/[0.025] transition group">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                              {v.cliente_nome.charAt(0).toUpperCase()}
                            </span>
                            {v.cliente_nome}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-400 whitespace-nowrap">{formatBRL(Number(v.valor))}</td>
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDate(v.data_venda)}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {prodLabel
                            ? <span className="flex items-center gap-1.5"><IconPackage />{prodLabel}</span>
                            : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 h-6">
                            {confirmDelete === v.id ? (
                              <>
                                <span className="text-xs text-zinc-400 mr-1 whitespace-nowrap">Excluir?</span>
                                <button onClick={() => handleDelete(v.id)} disabled={deleting === v.id} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer disabled:opacity-50"><IconCheck /></button>
                                <button onClick={() => setConfirmDelete(null)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX size={14}/></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => openEdit(v)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100"><IconEdit /></button>
                                <button onClick={() => setConfirmDelete(v.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100"><IconTrash /></button>
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
          CSV: cliente_nome, valor, data_venda, produtos &nbsp;·&nbsp; produtos: <span className="text-zinc-600">nome1:qtd1;nome2:qtd2</span>
        </p>
      </main>

      {/* ── Drawer ──────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-stretch sm:justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <div className="relative w-full sm:max-w-md bg-zinc-900 border-t border-zinc-800 sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none h-[92vh] sm:h-full flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="font-semibold text-lg">{editing ? 'Editar Venda' : 'Nova Venda'}</h2>
              <button onClick={closeDrawer} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col gap-5">

              {/* Cliente autocomplete */}
              <Field label="Cliente *">
                <div className="relative" ref={dropdownRef}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><IconUser /></span>
                  <input
                    type="text"
                    value={form.clienteSearch}
                    onChange={e => handleClienteInput(e.target.value)}
                    onFocus={() => setClienteDropdown(true)}
                    onBlur={() => setTimeout(() => setClienteDropdown(false), 150)}
                    placeholder="Buscar cliente por nome..."
                    autoComplete="off"
                    className={`${INPUT} pl-9 ${form.clienteId ? 'border-violet-500/50' : ''}`}
                  />
                  {form.clienteId && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, clienteSearch: '', clienteId: '', clienteNome: '' }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                    >
                      <IconX size={14} />
                    </button>
                  )}
                  {clienteDropdown && form.clienteSearch.length >= 1 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                      {clientesFiltrados.length > 0 ? (
                        clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => selectCliente(c)}
                            className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-violet-500/20 hover:text-white transition flex items-center gap-2"
                          >
                            <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                              {c.nome.charAt(0).toUpperCase()}
                            </span>
                            {c.nome}
                          </button>
                        ))
                      ) : (
                        <p className="px-4 py-2.5 text-sm text-zinc-500">Nenhum cliente encontrado</p>
                      )}
                    </div>
                  )}
                </div>
                {form.clienteId && (
                  <p className="text-xs text-violet-400 flex items-center gap-1 mt-0.5"><IconCheck size={12}/> Cliente selecionado</p>
                )}
              </Field>

              {/* Valor + Data */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor (R$) *">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder="0,00"
                    className={INPUT}
                  />
                </Field>
                <Field label="Data da Venda *">
                  <input
                    type="date"
                    value={form.dataVenda}
                    onChange={e => setForm(f => ({ ...f, dataVenda: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
              </div>

              {/* Produtos */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-300">Produtos</label>
                  <span className="text-xs text-zinc-500">{form.produtos.length} item{form.produtos.length !== 1 ? 's' : ''}</span>
                </div>

                {form.produtos.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {form.produtos.map((p, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={p.nome}
                          onChange={e => setProdutoField(i, 'nome', e.target.value)}
                          placeholder="Nome do produto"
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition"
                        />
                        <input
                          type="number"
                          min="1"
                          value={p.qtd}
                          onChange={e => setProdutoField(i, 'qtd', e.target.value)}
                          className="w-16 bg-zinc-800 border border-zinc-700 text-white text-center rounded-lg px-2 py-2 text-sm outline-none focus:border-violet-500 transition"
                          title="Quantidade"
                        />
                        <button
                          type="button"
                          onClick={() => removeProduto(i)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer shrink-0"
                        >
                          <IconX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addProduto}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-violet-500/50 rounded-lg px-4 py-2.5 transition cursor-pointer w-full justify-center"
                >
                  <IconPlus /> Adicionar produto
                </button>
              </div>

              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{formError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={closeDrawer} className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-2.5 transition cursor-pointer">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Registrar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
