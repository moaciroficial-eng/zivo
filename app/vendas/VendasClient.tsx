'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MobileNav from '@/app/components/MobileNav'
import BarcodeScanner from '@/app/components/BarcodeScanner'

/* ── Types ─────────────────────────────────────────────────── */

type Produto = { nome: string; qtd: number; preco_unitario?: number; desconto?: number }

type Venda = {
  id: string
  user_id: string
  cliente_id: string | null
  cliente_nome: string
  valor: number
  data_venda: string
  forma_pagamento: string | null
  produtos: Produto[]
  created_at: string
}

type ClienteOption = { id: string; nome: string }

type EstoqueItem = {
  id: string
  nome: string
  marca: string | null
  preco_venda: number | null
  codigo_barras: string | null
}

type FormProduto = {
  estoqueId: string
  nome: string
  qtd: string
  precoUnitario: string
  desconto: string
}

type FormState = {
  clienteSearch: string
  clienteId: string
  clienteNome: string
  valor: string
  dataVenda: string
  forma_pagamento: string
  produtos: FormProduto[]
}

type PagSlot = {
  metodo: string
  parcelas: number | null
  valor: string
  recebido: string
}

/* ── Constants ──────────────────────────────────────────────── */

const TODAY = new Date().toISOString().split('T')[0]

const METODOS = [
  { value: 'pix',      label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito',   label: 'Débito' },
  { value: 'credito',  label: 'Crédito' },
]

const PARCELAS = [1, 2, 3, 4, 6, 10, 12]

const EMPTY_PRODUTO: FormProduto = { estoqueId: '', nome: '', qtd: '1', precoUnitario: '', desconto: '0' }

const EMPTY: FormState = {
  clienteSearch: '', clienteId: '', clienteNome: '',
  valor: '', dataVenda: TODAY, forma_pagamento: '', produtos: [],
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
      try { const p = JSON.parse(s); return Array.isArray(p) ? p as Produto[] : [] } catch { return [] }
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

function labelMetodo(m: string): string {
  if (m === 'pix') return 'Pix'
  if (m === 'dinheiro') return 'Dinheiro'
  if (m === 'debito') return 'Débito'
  if (m.startsWith('credito_')) return `Crédito ${m.replace('credito_', '')}`
  return m
}

function labelPagamento(fp: string): string {
  if (!fp) return '—'
  if (fp.includes('+')) {
    return fp.split('+').map(p => {
      const [m, amount] = p.split(':')
      return `${labelMetodo(m)}${amount ? ` ${formatBRL(parseFloat(amount))}` : ''}`
    }).join(' + ')
  }
  return labelMetodo(fp)
}

function emptySlot(): PagSlot { return { metodo: '', parcelas: null, valor: '', recebido: '' } }

function fpToSlots(fp: string): { slots: PagSlot[]; hibrido: boolean } {
  if (!fp) return { slots: [emptySlot()], hibrido: false }
  if (fp.includes('+')) {
    const slots: PagSlot[] = fp.split('+').map(p => {
      const [method, amount] = p.split(':')
      let metodo = method; let parcelas: number | null = null
      if (method.startsWith('credito_')) { metodo = 'credito'; parcelas = parseInt(method.replace('credito_', '').replace('x', '')) || null }
      return { metodo, parcelas, valor: amount || '', recebido: '' }
    })
    return { slots, hibrido: true }
  }
  let metodo = fp; let parcelas: number | null = null
  if (fp.startsWith('credito_')) { metodo = 'credito'; parcelas = parseInt(fp.replace('credito_', '').replace('x', '')) || null }
  return { slots: [{ metodo, parcelas, valor: '', recebido: '' }], hibrido: false }
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
const IconArrowLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>

/* Payment method icons */
const IconZap = ({ size = 28 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const IconBanknote = ({ size = 28 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
const IconCard = ({ size = 28 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>

function MetodoIcon({ value }: { value: string }) {
  if (value === 'pix') return <IconZap />
  if (value === 'dinheiro') return <IconBanknote />
  return <IconCard />
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────── */

export default function VendasClient({
  user,
  initialVendas,
  clientes,
  estoqueItems,
}: {
  user: { id: string; email: string }
  initialVendas: Venda[]
  clientes: ClienteOption[]
  estoqueItems: EstoqueItem[]
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
  const [produtoDropdownIdx, setProdutoDropdownIdx] = useState<number | null>(null)
  const [showScanner, setShowScanner] = useState<number | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [pagSlots, setPagSlots] = useState<PagSlot[]>([emptySlot()])
  const [isHibrido, setIsHibrido] = useState(false)
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
    setForm(f => ({ ...f, produtos: [...f.produtos, { ...EMPTY_PRODUTO }] }))
  }

  function removeProduto(i: number) {
    setForm(f => ({ ...f, produtos: f.produtos.filter((_, idx) => idx !== i) }))
    setProdutoDropdownIdx(null)
  }

  function setProdutoField(i: number, key: keyof FormProduto, val: string) {
    setForm(f => ({ ...f, produtos: f.produtos.map((p, idx) => idx === i ? { ...p, [key]: val } : p) }))
  }

  function selectEstoqueItem(i: number, item: EstoqueItem) {
    const preco = item.preco_venda != null ? String(item.preco_venda) : ''
    const nome = item.nome + (item.marca ? ` (${item.marca})` : '')
    setForm(f => ({
      ...f,
      produtos: f.produtos.map((p, idx) =>
        idx === i ? { ...p, estoqueId: item.id, nome, precoUnitario: preco, desconto: '0' } : p
      ),
    }))
    setProdutoDropdownIdx(null)
  }

  function onScanBarcode(barcode: string, idx: number) {
    setShowScanner(null)
    const found = estoqueItems.find(e => e.codigo_barras === barcode)
    if (found) { selectEstoqueItem(idx, found); showToast(`Produto encontrado: ${found.nome}`) }
    else showToast(`Código ${barcode} não encontrado no estoque`, 'error')
  }

  function calcLinhaTotal(p: FormProduto): number {
    const preco = parseFloat(p.precoUnitario) || 0
    const qtd   = parseFloat(p.qtd) || 1
    const desc  = parseFloat(p.desconto) || 0
    return preco * qtd * (1 - desc / 100)
  }

  const totalSugerido = form.produtos.some(p => p.precoUnitario)
    ? form.produtos.reduce((s, p) => s + calcLinhaTotal(p), 0)
    : null

  const totalFinal = totalSugerido != null ? totalSugerido : (parseFloat(form.valor) || 0)

  const estoqueFiltrado = (i: number) => {
    const q = form.produtos[i]?.nome?.toLowerCase() ?? ''
    if (q.length < 1) return []
    return estoqueItems.filter(e => (e.nome + (e.marca ?? '')).toLowerCase().includes(q)).slice(0, 7)
  }

  /* ── Toast ── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Drawer ── */

  /* ── Payment helpers ── */

  function updateSlot(idx: number, updates: Partial<PagSlot>) {
    setPagSlots(slots => {
      const updated = slots.map((s, i) => i === idx ? { ...s, ...updates } : s)
      if (idx === 0 && isHibrido && updated.length === 2 && updates.valor !== undefined) {
        const rem = Math.max(0, totalFinal - (parseFloat(updates.valor) || 0))
        updated[1] = { ...updated[1], valor: rem.toFixed(2) }
      }
      return updated
    })
  }

  function enableHibrido() {
    const s0Val = parseFloat(pagSlots[0].valor) > 0 ? pagSlots[0].valor : totalFinal.toFixed(2)
    const s1Val = Math.max(0, totalFinal - parseFloat(s0Val)).toFixed(2)
    setPagSlots([{ ...pagSlots[0], valor: s0Val }, { ...emptySlot(), valor: s1Val }])
    setIsHibrido(true)
  }

  function disableHibrido() {
    setPagSlots([pagSlots[0]])
    setIsHibrido(false)
  }

  function buildFP(): string {
    if (isHibrido) {
      return pagSlots.filter(s => s.metodo).map(s => {
        const m = s.metodo === 'credito' && s.parcelas ? `credito_${s.parcelas}x` : s.metodo
        return `${m}:${(parseFloat(s.valor) || 0).toFixed(2)}`
      }).join('+')
    }
    const s = pagSlots[0]
    if (!s.metodo) return ''
    return s.metodo === 'credito' && s.parcelas ? `credito_${s.parcelas}x` : s.metodo
  }

  function canConfirmPayment(): boolean {
    if (isHibrido) return pagSlots.every(s => s.metodo && (s.metodo !== 'credito' || !!s.parcelas) && parseFloat(s.valor) > 0)
    const s = pagSlots[0]
    return !!s.metodo && (s.metodo !== 'credito' || !!s.parcelas)
  }

  function labelFromSlots(): string {
    if (!pagSlots[0].metodo) return ''
    if (isHibrido) {
      return pagSlots.filter(s => s.metodo).map(s => {
        const m = s.metodo === 'credito' && s.parcelas ? `credito_${s.parcelas}x` : s.metodo
        return `${labelMetodo(m)}${s.valor ? ` ${formatBRL(parseFloat(s.valor))}` : ''}`
      }).join(' + ')
    }
    const s = pagSlots[0]
    const m = s.metodo === 'credito' && s.parcelas ? `credito_${s.parcelas}x` : s.metodo
    return labelMetodo(m)
  }

  function resetPayment() {
    setPagSlots([emptySlot()]); setIsHibrido(false)
  }

  /* ── Drawer ── */

  function openNew() {
    setEditing(null); setForm(EMPTY); setFormError('')
    setClienteDropdown(false); setShowPayment(false)
    resetPayment(); setDrawer(true)
  }

  function openEdit(v: Venda) {
    setEditing(v)
    const fp = v.forma_pagamento ?? ''
    const { slots, hibrido } = fpToSlots(fp)
    setPagSlots(slots); setIsHibrido(hibrido)
    setForm({
      clienteSearch: v.cliente_nome,
      clienteId: v.cliente_id ?? '',
      clienteNome: v.cliente_nome,
      valor: String(v.valor),
      dataVenda: v.data_venda,
      forma_pagamento: fp,
      produtos: (v.produtos ?? []).map(p => ({
        estoqueId: '',
        nome: p.nome,
        qtd: String(p.qtd),
        precoUnitario: p.preco_unitario != null ? String(p.preco_unitario) : '',
        desconto: p.desconto != null ? String(p.desconto) : '0',
      })),
    })
    setFormError(''); setClienteDropdown(false); setProdutoDropdownIdx(null)
    setShowPayment(false); setDrawer(true)
  }

  function closeDrawer() {
    setDrawer(false); setEditing(null); setFormError('')
    setClienteDropdown(false); setProdutoDropdownIdx(null); setShowScanner(null)
    setShowPayment(false); resetPayment()
  }

  /* ── Vender (new) → open payment overlay ── */

  function handleVender() {
    if (!form.clienteNome.trim()) { setFormError('Informe o nome do cliente.'); return }
    if (!form.dataVenda) { setFormError('Informe a data.'); return }
    if (totalFinal <= 0) { setFormError('Adicione produtos com preço ou informe o valor.'); return }
    setFormError('')
    resetPayment()
    setShowPayment(true)
  }

  /* ── Confirm payment ── */

  function handlePaymentConfirm() {
    if (editing) {
      setShowPayment(false) // edit: just update state, save manually
    } else {
      handleSaveWithPayment()
    }
  }

  /* ── Save with payment (new venda) ── */

  async function handleSaveWithPayment() {
    setSaving(true)
    const fp = buildFP()
    const valor = totalFinal > 0 ? totalFinal : parseFloat(form.valor) || 0
    const payload = {
      cliente_id: form.clienteId || null,
      cliente_nome: form.clienteNome.trim(),
      valor,
      data_venda: form.dataVenda,
      forma_pagamento: fp || null,
      produtos: form.produtos.filter(p => p.nome.trim()).map(p => ({
        nome: p.nome.trim(),
        qtd: Number(p.qtd) || 1,
        preco_unitario: p.precoUnitario ? Number(p.precoUnitario) : null,
        desconto: p.desconto ? Number(p.desconto) : null,
      })),
    }
    const { data, error } = await supabase.from('vendas').insert(payload).select().single()
    if (error) { setFormError(error.message); setSaving(false); setShowPayment(false); return }
    setVendas(vs => [data, ...vs])
    showToast('Venda registrada.')
    if (payload.produtos.length > 0) {
      const mes = payload.data_venda.slice(0, 7)
      fetch('/api/marcar-plano-vendido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, data_venda: payload.data_venda, produtos_vendidos: payload.produtos }),
      }).catch(() => {})
    }
    setSaving(false); closeDrawer()
  }

  /* ── Save edit ── */

  async function handleSave() {
    if (!form.clienteNome.trim()) { setFormError('Informe o nome do cliente.'); return }
    if (!form.valor || Number(form.valor) <= 0) { setFormError('Informe o valor.'); return }
    if (!form.dataVenda) { setFormError('Informe a data.'); return }
    setSaving(true); setFormError('')

    const payload = {
      cliente_id: form.clienteId || null,
      cliente_nome: form.clienteNome.trim(),
      valor: Number(form.valor),
      data_venda: form.dataVenda,
      forma_pagamento: buildFP() || null,
      produtos: form.produtos.filter(p => p.nome.trim()).map(p => ({
        nome: p.nome.trim(),
        qtd: Number(p.qtd) || 1,
        preco_unitario: p.precoUnitario ? Number(p.precoUnitario) : null,
        desconto: p.desconto ? Number(p.desconto) : null,
      })),
    }
    const { data, error } = await supabase.from('vendas').update(payload).eq('id', editing!.id).select()
    if (error) { setFormError(error.message); setSaving(false); return }
    const updated = data?.[0] ?? { ...editing!, ...payload }
    setVendas(vs => vs.map(v => v.id === editing!.id ? updated : v))
    showToast('Venda atualizada.')
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
          data_venda: r['data_venda'] || TODAY,
          produtos,
        }
      }).filter(r => r.valor > 0)

      if (!inserts.length) { showToast('Nenhuma venda com valor válido.', 'error'); return }
      const { data, error } = await supabase.from('vendas').insert(inserts).select()
      if (error) { showToast(`Erro: ${error.message}`, 'error'); return }
      setVendas(vs => [...(data ?? []), ...vs])
      showToast(`${data?.length ?? 0} venda(s) importada(s).`)
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

  const filtered = vendas.filter(v => v.cliente_nome.toLowerCase().includes(search.toLowerCase()))
  const totalReceita = vendas.reduce((s, v) => s + Number(v.valor), 0)
  const ticketMedio = vendas.length > 0 ? totalReceita / vendas.length : 0

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-20 md:pb-0">

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
            <nav className="hidden md:flex items-center gap-1 text-sm">
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
              onTouchEnd={(e) => { e.preventDefault(); openNew() }}
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
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-violet-500 transition"
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
                <button onClick={openNew} className="mt-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg px-5 py-2 transition cursor-pointer">
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
                    {['Cliente', 'Valor', 'Data', 'Pagamento', 'Produtos', ''].map(h => (
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
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                          {v.forma_pagamento ? (
                            <span className="bg-zinc-800 px-2 py-0.5 rounded-md">{labelPagamento(v.forma_pagamento)}</span>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>
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
          <div className="relative w-full sm:max-w-md bg-zinc-900 border-t border-zinc-800 sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none h-[94vh] sm:h-full flex flex-col shadow-2xl overflow-hidden">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="font-semibold text-lg">{editing ? 'Editar Venda' : 'Nova Venda'}</h2>
              <button onClick={closeDrawer} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX /></button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col gap-5">

              {/* 1. PRODUTOS */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                    <IconPackage /> Produtos
                  </span>
                  {totalSugerido != null && (
                    <span className="text-sm font-bold text-emerald-400">{formatBRL(totalSugerido)}</span>
                  )}
                </div>

                {form.produtos.map((p, i) => (
                  <div key={i} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3 flex flex-col gap-2">
                    {/* Nome + Scan */}
                    <div className="relative flex gap-2">
                      <input
                        type="text"
                        value={p.nome}
                        onChange={e => { setProdutoField(i, 'nome', e.target.value); setProdutoField(i, 'estoqueId', ''); setProdutoDropdownIdx(i) }}
                        onFocus={() => setProdutoDropdownIdx(i)}
                        onBlur={() => setTimeout(() => setProdutoDropdownIdx(null), 200)}
                        placeholder="Buscar produto do estoque..."
                        className="flex-1 bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowScanner(i)}
                        className="p-2 bg-zinc-900 border border-zinc-700 text-violet-400 hover:bg-zinc-800 rounded-lg transition cursor-pointer shrink-0"
                        title="Escanear etiqueta"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                          <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                          <line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/>
                          <line x1="17" y1="12" x2="17" y2="12.01"/>
                        </svg>
                      </button>
                      {produtoDropdownIdx === i && p.nome.length >= 1 && (
                        <div className="absolute z-20 top-full left-0 right-10 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                          {estoqueFiltrado(i).length > 0 ? (
                            estoqueFiltrado(i).map(item => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={() => selectEstoqueItem(i, item)}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-violet-500/20 transition flex items-center justify-between gap-2"
                              >
                                <span className="text-zinc-200 truncate">{item.nome}{item.marca ? ` (${item.marca})` : ''}</span>
                                {item.preco_venda != null && <span className="text-emerald-400 text-xs shrink-0">{formatBRL(item.preco_venda)}</span>}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2.5 text-xs text-zinc-500">Nenhum produto encontrado</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Qtd + Preço + Desconto */}
                    <div className="flex gap-2 items-end">
                      <div className="flex flex-col flex-1">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Qtd</span>
                        <input
                          type="number" min="1"
                          value={p.qtd}
                          onChange={e => setProdutoField(i, 'qtd', e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 text-white text-center rounded-lg px-2 py-1.5 text-sm outline-none focus:border-violet-500 transition"
                        />
                      </div>
                      <div className="flex flex-col flex-[2]">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Preço (R$)</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={p.precoUnitario}
                          onChange={e => setProdutoField(i, 'precoUnitario', e.target.value)}
                          placeholder="0,00"
                          className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-2 py-1.5 text-sm outline-none focus:border-violet-500 transition"
                        />
                      </div>
                      <div className="flex flex-col flex-1">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Desc %</span>
                        <input
                          type="number" min="0" max="100"
                          value={p.desconto}
                          onChange={e => setProdutoField(i, 'desconto', e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 text-white text-center rounded-lg px-2 py-1.5 text-sm outline-none focus:border-violet-500 transition"
                        />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Total</span>
                        <span className="text-sm font-semibold text-emerald-400 py-1.5">{p.precoUnitario ? formatBRL(calcLinhaTotal(p)) : '—'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduto(i)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer shrink-0"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addProduto}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-violet-500/50 rounded-xl px-4 py-3 transition cursor-pointer w-full justify-center"
                >
                  <IconPlus /> Adicionar produto
                </button>
              </div>

              <hr className="border-zinc-800" />

              {/* 2. CLIENTE */}
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
                    <button type="button" onClick={() => setForm(f => ({ ...f, clienteSearch: '', clienteId: '', clienteNome: '' }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition">
                      <IconX size={14} />
                    </button>
                  )}
                  {clienteDropdown && form.clienteSearch.length >= 1 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                      {clientesFiltrados.length > 0 ? clientesFiltrados.map(c => (
                        <button key={c.id} type="button" onMouseDown={() => selectCliente(c)} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-violet-500/20 hover:text-white transition flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">{c.nome.charAt(0).toUpperCase()}</span>
                          {c.nome}
                        </button>
                      )) : (
                        <p className="px-4 py-2.5 text-sm text-zinc-500">Nenhum cliente encontrado</p>
                      )}
                    </div>
                  )}
                </div>
                {form.clienteId && (
                  <p className="text-xs text-violet-400 flex items-center gap-1 mt-0.5"><IconCheck size={12}/> Cliente selecionado</p>
                )}
              </Field>

              {/* 3. DATA + VALOR */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data *">
                  <input type="date" value={form.dataVenda} onChange={e => setForm(f => ({ ...f, dataVenda: e.target.value }))} className={INPUT} />
                </Field>
                <Field label={totalSugerido != null ? `Valor — auto` : 'Valor (R$) *'}>
                  <input
                    type="number" min="0" step="0.01"
                    value={totalSugerido != null ? totalSugerido.toFixed(2) : form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    readOnly={totalSugerido != null}
                    placeholder="0,00"
                    className={`${INPUT} ${totalSugerido != null ? 'text-emerald-400 border-emerald-500/30 opacity-80' : ''}`}
                  />
                </Field>
              </div>

              {/* 4. PAGAMENTO — edit only */}
              {editing && (
                <Field label="Pagamento">
                  <button
                    type="button"
                    onClick={() => setShowPayment(true)}
                    className="flex items-center justify-between w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm hover:border-zinc-500 transition cursor-pointer text-left"
                  >
                    <span className={labelFromSlots() ? 'text-white' : 'text-zinc-500'}>
                      {labelFromSlots() || 'Selecionar forma de pagamento...'}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </Field>
              )}

              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{formError}</p>
              )}
            </div>

            {/* Drawer footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={closeDrawer} className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 transition cursor-pointer">
                Cancelar
              </button>
              {editing ? (
                <button onClick={handleSave} disabled={saving} className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 rounded-xl py-3 transition cursor-pointer">
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              ) : (
                <button onClick={handleVender} className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl py-3 transition cursor-pointer flex items-center justify-center gap-2">
                  Vender
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              )}
            </div>

            {/* ── Payment overlay ── */}
            {showPayment && (
              <div className="absolute inset-0 bg-zinc-900 flex flex-col rounded-t-2xl sm:rounded-none">
                {/* Back + total */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 shrink-0">
                  <button
                    onClick={() => { setShowPayment(false); if (!editing) resetPayment() }}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                  >
                    <IconArrowLeft />
                  </button>
                  <div className="flex-1">
                    <h2 className="font-semibold text-base">Como vai pagar?</h2>
                    {totalFinal > 0 && <p className="text-sm font-bold text-emerald-400">{formatBRL(totalFinal)}</p>}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">

                  {/* ── Single mode ── */}
                  {!isHibrido && (() => {
                    const s = pagSlots[0]
                    const troco = s.metodo === 'dinheiro' && s.recebido ? parseFloat(s.recebido) - totalFinal : null
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {METODOS.map(m => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => updateSlot(0, { metodo: m.value, parcelas: null, recebido: '' })}
                              className={`flex flex-col items-center gap-2.5 py-6 rounded-2xl border-2 transition cursor-pointer ${
                                s.metodo === m.value
                                  ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                              }`}
                            >
                              <MetodoIcon value={m.value} />
                              <span className="font-semibold text-sm">{m.label}</span>
                            </button>
                          ))}
                        </div>

                        {s.metodo === 'dinheiro' && (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-zinc-400">Valor recebido</label>
                            <input
                              type="number" min="0" step="0.01" autoFocus
                              value={s.recebido}
                              onChange={e => updateSlot(0, { recebido: e.target.value })}
                              placeholder={`Mínimo ${formatBRL(totalFinal)}`}
                              className={INPUT}
                            />
                            {troco !== null && troco >= 0 && (
                              <p className="text-base font-bold text-emerald-400">Troco: {formatBRL(troco)}</p>
                            )}
                            {troco !== null && troco < 0 && (
                              <p className="text-sm text-red-400">Valor insuficiente</p>
                            )}
                          </div>
                        )}

                        {s.metodo === 'credito' && (
                          <div className="flex flex-col gap-3">
                            <p className="text-sm font-medium text-zinc-400">Parcelas</p>
                            <div className="grid grid-cols-4 gap-2">
                              {PARCELAS.map(n => (
                                <button key={n} type="button" onClick={() => updateSlot(0, { parcelas: n })}
                                  className={`py-3.5 rounded-xl border text-sm font-bold transition cursor-pointer ${s.parcelas === n ? 'border-violet-500 bg-violet-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'}`}
                                >{n}x</button>
                              ))}
                            </div>
                            {s.parcelas && totalFinal > 0 && (
                              <p className="text-xs text-zinc-500 text-center">{s.parcelas}x de {formatBRL(totalFinal / s.parcelas)} sem juros</p>
                            )}
                          </div>
                        )}

                        {s.metodo && (
                          <button type="button" onClick={enableHibrido}
                            className="text-sm text-zinc-600 hover:text-violet-400 transition text-left"
                          >
                            + Dividir em 2 formas de pagamento
                          </button>
                        )}
                      </>
                    )
                  })()}

                  {/* ── Híbrido mode ── */}
                  {isHibrido && (
                    <div className="flex flex-col gap-4">
                      {pagSlots.map((s, idx) => {
                        const slotVal = parseFloat(s.valor) || 0
                        const troco = s.metodo === 'dinheiro' && s.recebido ? parseFloat(s.recebido) - slotVal : null
                        return (
                          <div key={idx} className="bg-zinc-800/50 rounded-2xl p-4 flex flex-col gap-3 border border-zinc-700/50">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pagamento {idx + 1}</p>

                            <div className="grid grid-cols-4 gap-1.5">
                              {METODOS.map(m => (
                                <button key={m.value} type="button"
                                  onClick={() => updateSlot(idx, { metodo: m.value, parcelas: null, recebido: '' })}
                                  className={`text-xs py-2.5 rounded-xl border font-medium transition cursor-pointer ${
                                    s.metodo === m.value ? 'border-violet-500 bg-violet-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                                  }`}
                                >{m.label}</button>
                              ))}
                            </div>

                            {s.metodo && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-zinc-400 shrink-0">R$</span>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={s.valor}
                                  onChange={e => updateSlot(idx, { valor: e.target.value })}
                                  placeholder="0,00"
                                  className="flex-1 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition"
                                />
                              </div>
                            )}

                            {s.metodo === 'dinheiro' && (
                              <div className="flex flex-col gap-1.5">
                                <input
                                  type="number" min="0" step="0.01"
                                  value={s.recebido}
                                  onChange={e => updateSlot(idx, { recebido: e.target.value })}
                                  placeholder={`Recebido (mín. ${formatBRL(slotVal)})`}
                                  className={INPUT}
                                />
                                {troco !== null && troco >= 0 && <p className="text-sm font-bold text-emerald-400">Troco: {formatBRL(troco)}</p>}
                                {troco !== null && troco < 0 && <p className="text-sm text-red-400">Valor insuficiente</p>}
                              </div>
                            )}

                            {s.metodo === 'credito' && (
                              <div className="flex flex-col gap-2">
                                <div className="grid grid-cols-4 gap-1.5">
                                  {PARCELAS.map(n => (
                                    <button key={n} type="button" onClick={() => updateSlot(idx, { parcelas: n })}
                                      className={`text-xs py-2.5 rounded-xl border font-bold transition cursor-pointer ${s.parcelas === n ? 'border-violet-500 bg-violet-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'}`}
                                    >{n}x</button>
                                  ))}
                                </div>
                                {s.parcelas && slotVal > 0 && (
                                  <p className="text-xs text-zinc-500">{s.parcelas}x de {formatBRL(slotVal / s.parcelas)}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      <button type="button" onClick={disableHibrido}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition"
                      >
                        Cancelar divisão de pagamento
                      </button>
                    </div>
                  )}

                </div>

                {/* Confirm button */}
                {canConfirmPayment() && (
                  <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
                    <button
                      onClick={handlePaymentConfirm}
                      disabled={saving}
                      className="w-full text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 rounded-xl py-3.5 transition cursor-pointer"
                    >
                      {saving ? 'Salvando...' : editing ? 'Confirmar' : `Registrar Venda`}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      <MobileNav />

      {showScanner !== null && (
        <BarcodeScanner
          onScan={code => onScanBarcode(code, showScanner)}
          onClose={() => setShowScanner(null)}
        />
      )}
    </div>
  )
}
