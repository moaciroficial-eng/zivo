'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export type Dependente = {
  id: string
  nome: string
  relacao: 'marido' | 'pai' | 'filho' | 'filha'
  genero: 'M' | 'F'
  tamanho_camiseta?: string
  tamanho_calca?: string
  tamanho_tenis?: string
  data_nascimento?: string
}

export type Cliente = {
  id: string
  user_id: string
  nome: string
  telefone: string | null
  email: string | null
  genero: 'M' | 'F' | null
  tamanho_camiseta: string | null
  tamanho_calca: string | null
  tamanho_tenis: string | null
  data_nascimento: string | null
  dia_pagamento: number | null
  observacoes: string | null
  dependentes: Dependente[] | null
  created_at: string
}

type FormState = {
  nome: string
  telefone: string
  email: string
  genero: string
  tamanho_camiseta: string
  tamanho_calca: string
  tamanho_tenis: string
  data_nascimento: string
  dia_pagamento: string
  observacoes: string
}

type ProdutoHistorico = {
  nome: string
  qtd: number
  tamanho?: string
  preco_unitario?: number
  desconto?: number
  estoque_id?: string
}

type HistoricoVenda = {
  id: string
  valor: number
  data_venda: string
  forma_pagamento: string | null
  produtos: ProdutoHistorico[]
}

type HistoricoCrediario = {
  id: string
  valor_total: number
  valor_entrada: number
  num_parcelas: number
  status: string
  created_at: string
  parcelas_crediario: {
    id: string
    numero: number
    valor: number
    data_vencimento: string
    pago: boolean
    data_pagamento: string | null
  }[]
}

const EMPTY: FormState = {
  nome: '', telefone: '', email: '', genero: '',
  tamanho_camiseta: '', tamanho_calca: '', tamanho_tenis: '',
  data_nascimento: '', dia_pagamento: '', observacoes: '',
}

const CAMISETAS = ['P', 'M', 'G', 'GG', 'XGG']
const CALCAS    = ['38', '40', '42', '44', '46', '48', '50']
const TENIS     = ['37', '38', '39', '40', '41', '42', '43', '44']

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function labelMetodo(m: string): string {
  if (m === 'pix') return 'Pix'
  if (m === 'dinheiro') return 'Dinheiro'
  if (m === 'debito') return 'Débito'
  if (m === 'crediario') return 'Crediário'
  if (m.startsWith('credito_')) return `Crédito ${m.replace('credito_', '')}`
  return m
}

function labelPagamento(fp: string | null): string {
  if (!fp) return '—'
  if (fp === 'crediario') return 'Crediário'
  if (fp.includes('+')) {
    return fp.split('+').map(p => {
      const [met] = p.split(':')
      return labelMetodo(met)
    }).join(' + ')
  }
  return labelMetodo(fp)
}

const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)
const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
)
const IconX = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 18 4 13" />
  </svg>
)
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const IconHistory = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
    <path d="M12 7v5l4 2"/>
  </svg>
)

export default function ClientesClient({
  user,
  initialClientes,
}: {
  user: { id: string; email: string }
  initialClientes: Cliente[]
}) {
  const supabase = createClient()
  const [clientes, setClientes] = useState(initialClientes)
  const [drawer, setDrawer] = useState(false)
  const [drawerTab, setDrawerTab] = useState<'dados' | 'historico' | 'ia'>('dados')
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [historicoVendas, setHistoricoVendas] = useState<HistoricoVenda[]>([])
  const [historicoCrediarios, setHistoricoCrediarios] = useState<HistoricoCrediario[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [insightCliente, setInsightCliente] = useState<Record<string, unknown> | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [calculandoInsight, setCalculandoInsight] = useState(false)

  const [pagandoParcelaCliente, setPagandoParcelaCliente] = useState<{ crediarioId: string; parcelaId: string } | null>(null)

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [addingDep, setAddingDep] = useState(false)
  const [depForm, setDepForm] = useState({ nome: '', relacao: '' as Dependente['relacao'] | '', genero: '' as 'M' | 'F' | '', tamanho_camiseta: '', tamanho_calca: '', tamanho_tenis: '', data_nascimento: '' })

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function openNew() {
    setEditing(null); setForm(EMPTY); setFormError(''); setDrawer(true)
  }

  function openEdit(c: Cliente) {
    setEditing(c)
    setForm({
      nome: c.nome,
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      tamanho_camiseta: c.tamanho_camiseta ?? '',
      tamanho_calca: c.tamanho_calca ?? '',
      genero: c.genero ?? '',
      tamanho_tenis: c.tamanho_tenis ?? '',
      data_nascimento: c.data_nascimento ?? '',
      dia_pagamento: c.dia_pagamento?.toString() ?? '',
      observacoes: c.observacoes ?? '',
    })
    setDependentes(c.dependentes ?? [])
    setAddingDep(false)
    setFormError(''); setDrawerTab('dados'); setDrawer(true)
    loadHistorico(c)
  }

  function openPerfil(c: Cliente) {
    openEdit(c)
    setDrawerTab('historico')
  }

  function closeDrawer() {
    setDrawer(false); setEditing(null); setFormError('')
    setHistoricoVendas([]); setHistoricoCrediarios([]); setInsightCliente(null)
    setDependentes([]); setAddingDep(false)
  }

  async function loadHistorico(c: Cliente) {
    setLoadingHistorico(true)
    const [{ data: vendas }, { data: crediarios }] = await Promise.all([
      supabase.from('vendas').select('id, valor, data_venda, forma_pagamento, produtos')
        .eq('cliente_id', c.id).order('data_venda', { ascending: false }),
      supabase.from('crediario').select('*, parcelas_crediario(*)')
        .eq('cliente_id', c.id).order('created_at', { ascending: false }),
    ])
    setHistoricoVendas((vendas ?? []) as HistoricoVenda[])
    setHistoricoCrediarios((crediarios ?? []) as HistoricoCrediario[])
    setLoadingHistorico(false)
  }

  async function loadInsight(c: Cliente) {
    setLoadingInsight(true)
    const { data } = await supabase
      .from('contato_insights')
      .select('classificacao,tendencia,total_gasto,qtd_compras,ticket_medio,dias_sem_comprar,ultima_compra,ritmo_compra_dias,mes_pico,marcas_favoritas,tamanhos')
      .eq('cliente_id', c.id)
      .maybeSingle()
    setInsightCliente(data as Record<string, unknown> | null)
    setLoadingInsight(false)
  }

  async function calcularInsight(c: Cliente) {
    setCalculandoInsight(true)
    const res = await fetch('/api/clientes/calcular-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: c.id }),
    })
    const { insight } = await res.json()
    if (insight) setInsightCliente(insight)
    setCalculandoInsight(false)
  }

  async function handleMarcarParcelaPaga(crediarioId: string, parcelaId: string, formaPagamento: string) {
    const cr = historicoCrediarios.find(c => c.id === crediarioId)
    const parcela = cr?.parcelas_crediario.find(p => p.id === parcelaId)
    if (!cr || !parcela || !editing) return
    setPagandoParcelaCliente(null)
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('parcelas_crediario')
      .update({ pago: true, data_pagamento: today })
      .eq('id', parcelaId)
    if (error) { showToast(error.message, 'error'); return }
    const { data: caixaAberto } = await supabase
      .from('caixas').select('id').eq('user_id', user.id).eq('status', 'aberto').maybeSingle()
    await supabase.from('vendas').insert({
      user_id: user.id,
      cliente_id: editing.id,
      cliente_nome: editing.nome,
      valor: parcela.valor,
      data_venda: today,
      forma_pagamento: formaPagamento,
      caixa_id: caixaAberto?.id ?? null,
      produtos: [],
    })
    const updatedCrediarios = historicoCrediarios.map(c => {
      if (c.id !== crediarioId) return c
      const updatedParcelas = c.parcelas_crediario.map(p =>
        p.id === parcelaId ? { ...p, pago: true, data_pagamento: today } : p
      )
      return { ...c, parcelas_crediario: updatedParcelas }
    })
    setHistoricoCrediarios(updatedCrediarios)
    const allPaid = updatedCrediarios.find(c => c.id === crediarioId)?.parcelas_crediario.every(p => p.pago)
    if (allPaid) await supabase.from('crediario').update({ status: 'quitado' }).eq('id', crediarioId)
    showToast('Parcela recebida e lançada no faturamento.')
  }

  async function handleSave() {
    if (!form.nome.trim()) { setFormError('Nome é obrigatório.'); return }
    setSaving(true); setFormError('')

    /* Se o mini-form de dependente ainda está aberto com dados válidos, inclui automaticamente */
    let depsFinal = dependentes
    if (addingDep && depForm.nome.trim() && depForm.relacao && depForm.genero) {
      const pendente: Dependente = {
        id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: depForm.nome.trim(),
        relacao: depForm.relacao as Dependente['relacao'],
        genero: depForm.genero as 'M' | 'F',
        tamanho_camiseta: depForm.tamanho_camiseta || undefined,
        tamanho_calca: depForm.tamanho_calca || undefined,
        tamanho_tenis: depForm.tamanho_tenis || undefined,
        data_nascimento: depForm.data_nascimento || undefined,
      }
      depsFinal = [...dependentes, pendente]
      setDependentes(depsFinal)
      setAddingDep(false)
    }

    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      email: form.email || null,
      genero: (form.genero as 'M' | 'F') || null,
      tamanho_camiseta: form.tamanho_camiseta || null,
      tamanho_calca: form.tamanho_calca || null,
      tamanho_tenis: form.tamanho_tenis || null,
      data_nascimento: form.data_nascimento || null,
      dia_pagamento: form.dia_pagamento ? Number(form.dia_pagamento) : null,
      observacoes: form.observacoes || null,
      dependentes: depsFinal,
    }

    if (editing) {
      const { data, error } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', editing.id)
        .eq('user_id', user.id)
        .select()
      if (error) { setFormError(error.message); setSaving(false); return }
      if (!data || data.length === 0) {
        setFormError('Não foi possível salvar. Tente novamente.')
        setSaving(false)
        return
      }
      setClientes(cs => cs.map(c => c.id === editing.id ? data[0] : c))
      showToast('Cliente atualizado com sucesso.')
    } else {
      const { data, error } = await supabase.from('clientes').insert({ ...payload, user_id: user.id }).select()
      if (error) { setFormError(error.message); setSaving(false); return }
      const inserted = data?.[0]
      if (inserted) setClientes(cs => [inserted, ...cs])
      showToast('Cliente adicionado com sucesso.')
    }

    setSaving(false); closeDrawer()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (!error) { setClientes(cs => cs.filter(c => c.id !== id)); showToast('Cliente removido.') }
    else showToast(error.message, 'error')
    setDeleting(null); setConfirmDelete(null)
  }

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
        .filter(r => r['nome'])

      if (!rows.length) { showToast('Nenhum dado válido encontrado no CSV.', 'error'); return }

      const inserts = rows.map(r => ({
        user_id: user.id,
        nome: r['nome'],
        telefone: r['telefone'] || null,
        email: r['email'] || null,
        tamanho_camiseta: CAMISETAS.includes(r['tamanho_camiseta']) ? r['tamanho_camiseta'] : null,
        tamanho_calca:    CALCAS.includes(r['tamanho_calca'])       ? r['tamanho_calca']    : null,
        tamanho_tenis:    TENIS.includes(r['tamanho_tenis'])         ? r['tamanho_tenis']    : null,
        data_nascimento: r['data_nascimento'] || null,
        dia_pagamento: r['dia_pagamento'] ? Number(r['dia_pagamento']) : null,
        observacoes: r['observacoes'] || null,
      }))

      const { data, error } = await supabase.from('clientes').insert(inserts).select()
      if (error) { showToast(`Erro na importação: ${error.message}`, 'error'); return }
      setClientes(cs => [...(data ?? []), ...cs])
      showToast(`${data?.length ?? 0} cliente(s) importado(s) com sucesso.`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const filtered = clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.telefone ?? '').includes(search)
  )

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Page title + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Clientes</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
            </p>
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
              <IconPlus /> Novo Cliente
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border ${
            toast.type === 'success'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck size={15} /> : <IconX size={15} />}
            {toast.msg}
          </div>
        )}

        {/* Search */}
        <div className="mb-5">
          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
            />
          </div>
        </div>

        {/* Table / Empty state */}
        {filtered.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            {search ? (
              <>
                <p className="font-medium text-zinc-300">Nenhum resultado para &quot;{search}&quot;</p>
                <p className="text-zinc-500 text-sm">Tente buscar por nome, email ou telefone.</p>
                <button onClick={() => setSearch('')} className="mt-1 text-sm text-violet-400 hover:text-violet-300 transition">
                  Limpar busca
                </button>
              </>
            ) : (
              <>
                <p className="font-medium text-zinc-300">Nenhum cliente ainda</p>
                <p className="text-zinc-500 text-sm">Adicione o primeiro cliente ou importe via CSV.</p>
                <button
                  onClick={openNew}
                  className="mt-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-5 py-2 transition cursor-pointer"
                >
                  Novo Cliente
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
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Nome</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Telefone</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">E-mail</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Tamanhos</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Nascimento</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Dia Pag.</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-white/[0.025] transition group">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <button onClick={() => openPerfil(c)} className="hover:text-violet-400 transition cursor-pointer text-left">
                          {c.nome}
                          {c.genero && (
                            <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${c.genero === 'M' ? 'bg-blue-500/15 text-blue-400' : 'bg-pink-500/15 text-pink-400'}`}>
                              {c.genero}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{c.telefone ?? <span className="text-zinc-700">—</span>}</td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{c.email ?? <span className="text-zinc-700">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {c.tamanho_camiseta && (
                            <span className="px-1.5 py-0.5 bg-violet-500/15 border border-violet-500/25 text-violet-300 rounded text-xs font-medium whitespace-nowrap">
                              Cam {c.tamanho_camiseta}
                            </span>
                          )}
                          {c.tamanho_calca && (
                            <span className="px-1.5 py-0.5 bg-blue-500/15 border border-blue-500/25 text-blue-300 rounded text-xs font-medium whitespace-nowrap">
                              Cal {c.tamanho_calca}
                            </span>
                          )}
                          {c.tamanho_tenis && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 rounded text-xs font-medium whitespace-nowrap">
                              Tên {c.tamanho_tenis}
                            </span>
                          )}
                          {!c.tamanho_camiseta && !c.tamanho_calca && !c.tamanho_tenis && (
                            <span className="text-zinc-700">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{c.data_nascimento ? formatDate(c.data_nascimento) : <span className="text-zinc-700">—</span>}</td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{c.dia_pagamento ? `Dia ${c.dia_pagamento}` : <span className="text-zinc-700">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 h-6">
                          {confirmDelete === c.id ? (
                            <>
                              <span className="text-xs text-zinc-400 mr-1 whitespace-nowrap">Excluir?</span>
                              <button
                                onClick={() => handleDelete(c.id)}
                                disabled={deleting === c.id}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer disabled:opacity-50"
                                title="Confirmar exclusão"
                              >
                                <IconCheck />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Cancelar"
                              >
                                <IconX size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEdit(c)}
                                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100"
                                title="Editar"
                              >
                                <IconEdit />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(c.id)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100"
                                title="Excluir"
                              >
                                <IconTrash />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-700 mt-4 font-mono">
          CSV: nome, telefone, email, genero (M/F), tamanho_camiseta, tamanho_calca, tamanho_tenis, data_nascimento, dia_pagamento, observacoes
        </p>
      </main>

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-stretch sm:justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeDrawer}
          />
          <div className="relative w-full sm:max-w-md bg-zinc-900 border-t border-zinc-800 sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none h-[92vh] sm:h-full flex flex-col shadow-2xl">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="font-semibold text-lg">{editing ? editing.nome : 'Novo Cliente'}</h2>
                {editing && <p className="text-xs text-zinc-500 mt-0.5">{editing.telefone ?? editing.email ?? 'Sem contato'}</p>}
              </div>
              <button onClick={closeDrawer} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                <IconX />
              </button>
            </div>

            {/* Tabs — só para clientes existentes */}
            {editing && (
              <div className="flex border-b border-zinc-800 shrink-0">
                <button
                  onClick={() => setDrawerTab('dados')}
                  className={`flex-1 py-2.5 text-sm font-medium transition cursor-pointer ${drawerTab === 'dados' ? 'text-white border-b-2 border-[#3B6FFF]' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Cadastro
                </button>
                <button
                  onClick={() => { setDrawerTab('historico'); if (editing) loadHistorico(editing) }}
                  className={`flex-1 py-2.5 text-sm font-medium transition cursor-pointer ${drawerTab === 'historico' ? 'text-white border-b-2 border-[#3B6FFF]' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Histórico
                </button>
                <button
                  onClick={() => { setDrawerTab('ia'); if (editing) loadInsight(editing) }}
                  className={`flex-1 py-2.5 text-sm font-medium transition cursor-pointer ${drawerTab === 'ia' ? 'text-white border-b-2 border-[#00D4AA]' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  IA
                </button>
              </div>
            )}

            {/* Drawer body — aba Histórico */}
            {editing && drawerTab === 'historico' && (
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 flex flex-col gap-5">
                {loadingHistorico ? (
                  <p className="text-sm text-zinc-500 text-center py-10">Carregando...</p>
                ) : (() => {
                  type Prod = ProdutoHistorico
                  const compras = historicoVendas.filter(v => {
                    const prods = Array.isArray(v.produtos) ? v.produtos as Prod[] : []
                    return prods.length > 0
                  })
                  const totalRecebido = historicoVendas.reduce((s, v) => s + Number(v.valor), 0)
                  const today = new Date().toISOString().split('T')[0]
                  return (
                    <>
                      {/* Resumo */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3">
                          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Compras</p>
                          <p className="text-xl font-bold mt-0.5">{compras.length}</p>
                        </div>
                        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3">
                          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Total recebido</p>
                          <p className="text-xl font-bold text-emerald-400 mt-0.5">{formatBRL(totalRecebido)}</p>
                        </div>
                      </div>

                      {/* Crediários em aberto */}
                      {historicoCrediarios.filter(c => c.status === 'aberto').length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Crediário em Aberto</p>
                          <div className="flex flex-col gap-3">
                            {historicoCrediarios.filter(c => c.status === 'aberto').map(cr => {
                              const restante = cr.parcelas_crediario.filter(p => !p.pago).reduce((s, p) => s + Number(p.valor), 0)
                              return (
                                <div key={cr.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10">
                                    <p className="text-sm font-medium">
                                      {cr.num_parcelas}x de {formatBRL((Number(cr.valor_total) - Number(cr.valor_entrada)) / cr.num_parcelas)}
                                      {cr.valor_entrada > 0 && <span className="text-zinc-500 text-xs"> · entrada {formatBRL(cr.valor_entrada)}</span>}
                                    </p>
                                    <p className="text-sm font-bold text-amber-400">{formatBRL(restante)} restante</p>
                                  </div>
                                  <div className="divide-y divide-amber-500/10">
                                    {cr.parcelas_crediario.sort((a, b) => a.numero - b.numero).map(p => {
                                      const abrindo = pagandoParcelaCliente?.parcelaId === p.id
                                      return (
                                        <div key={p.id} className={p.pago ? 'opacity-40' : ''}>
                                          <div className="flex items-center justify-between px-4 py-2.5">
                                            <div>
                                              <p className="text-sm font-medium">Parcela {p.numero} · {formatBRL(p.valor)}</p>
                                              <p className={`text-xs mt-0.5 ${p.pago ? 'text-emerald-400' : p.data_vencimento < today ? 'text-red-400' : 'text-zinc-500'}`}>
                                                {p.pago ? `Paga em ${formatDate(p.data_pagamento ?? p.data_vencimento)}` : p.data_vencimento < today ? `Atrasada · venceu ${formatDate(p.data_vencimento)}` : `Vence ${formatDate(p.data_vencimento)}`}
                                              </p>
                                            </div>
                                            {!p.pago && !abrindo && (
                                              <button
                                                onClick={() => setPagandoParcelaCliente({ crediarioId: cr.id, parcelaId: p.id })}
                                                className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-1.5 transition cursor-pointer shrink-0"
                                              >
                                                Pagar
                                              </button>
                                            )}
                                            {!p.pago && abrindo && (
                                              <button
                                                onClick={() => setPagandoParcelaCliente(null)}
                                                className="text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer shrink-0"
                                              >
                                                Cancelar
                                              </button>
                                            )}
                                            {p.pago && <span className="text-xs text-emerald-500 flex items-center gap-1"><IconCheck size={12} /> Pago</span>}
                                          </div>
                                          {abrindo && (
                                            <div className="px-4 pb-3">
                                              <p className="text-xs text-zinc-500 mb-2">Como o cliente vai pagar?</p>
                                              <div className="grid grid-cols-4 gap-2">
                                                {[
                                                  { id: 'pix', label: 'Pix' },
                                                  { id: 'dinheiro', label: 'Dinheiro' },
                                                  { id: 'debito', label: 'Débito' },
                                                  { id: 'credito', label: 'Crédito' },
                                                ].map(m => (
                                                  <button
                                                    key={m.id}
                                                    onClick={() => handleMarcarParcelaPaga(cr.id, p.id, m.id)}
                                                    className="py-2 rounded-lg border border-zinc-700 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition cursor-pointer text-xs font-medium"
                                                  >
                                                    {m.label}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Lista de compras detalhada */}
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Compras</p>
                        {compras.length === 0 ? (
                          <p className="text-sm text-zinc-500 text-center py-6">Nenhuma compra com produtos registrada.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {compras.map(v => {
                              const prods = (Array.isArray(v.produtos) ? v.produtos : []) as Prod[]
                              const fpParts = v.forma_pagamento?.includes('+')
                                ? v.forma_pagamento.split('+').map(s => {
                                    const [m] = s.split(':')
                                    return labelMetodo(m ?? '')
                                  }).join(' + ')
                                : labelPagamento(v.forma_pagamento)
                              return (
                                <div key={v.id} className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl overflow-hidden">
                                  {/* Cabeçalho da venda */}
                                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
                                    <div>
                                      <p className="text-sm font-semibold">{formatDate(v.data_venda)}</p>
                                      <p className="text-xs text-zinc-500 mt-0.5">{fpParts}</p>
                                    </div>
                                    <p className="text-base font-bold text-emerald-400">{formatBRL(Number(v.valor))}</p>
                                  </div>

                                  {/* Produtos */}
                                  <div className="divide-y divide-zinc-800/60">
                                    {prods.map((p, i) => {
                                      const linha = p.preco_unitario
                                        ? p.preco_unitario * p.qtd * (1 - (p.desconto ?? 0) / 100)
                                        : null
                                      const inner = (
                                        <div className="flex items-start justify-between gap-3 px-4 py-3">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-sm font-semibold text-white">{p.nome}</p>
                                              {p.tamanho && (
                                                <span className="text-xs bg-zinc-700/70 text-zinc-300 px-1.5 py-0.5 rounded">
                                                  {p.tamanho}
                                                </span>
                                              )}
                                              {p.estoque_id && (
                                                <span className="text-xs text-violet-400">Ver no estoque ↗</span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                              <span className="text-xs text-zinc-500">Qtd: {p.qtd}</span>
                                              {p.preco_unitario && (
                                                <span className="text-xs text-zinc-500">{formatBRL(p.preco_unitario)} un.</span>
                                              )}
                                              {p.desconto && p.desconto > 0 ? (
                                                <span className="text-xs text-amber-400">-{p.desconto}% desc.</span>
                                              ) : null}
                                            </div>
                                          </div>
                                          {linha != null && (
                                            <p className="text-sm font-bold text-zinc-200 shrink-0">{formatBRL(linha)}</p>
                                          )}
                                        </div>
                                      )
                                      return p.estoque_id ? (
                                        <Link
                                          key={i}
                                          href={`/estoque/${p.estoque_id}/editar`}
                                          className="block hover:bg-zinc-700/30 transition"
                                        >
                                          {inner}
                                        </Link>
                                      ) : (
                                        <div key={i}>{inner}</div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {/* Drawer body — aba IA */}
            {editing && drawerTab === 'ia' && (
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                {loadingInsight ? (
                  <p className="text-sm text-zinc-500 text-center py-10">Carregando...</p>
                ) : !insightCliente ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                      <span className="text-2xl">🤖</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-300">Ainda sem análise</p>
                    <p className="text-xs text-zinc-500 max-w-[220px]">Clique abaixo para calcular agora ou aguarde o cron das 9h.</p>
                    <button
                      onClick={() => editing && calcularInsight(editing)}
                      disabled={calculandoInsight}
                      className="mt-2 px-4 py-2 bg-[#3B6FFF] hover:bg-[#5585FF] disabled:opacity-50 text-white text-sm font-medium rounded-xl transition cursor-pointer"
                    >
                      {calculandoInsight ? 'Calculando...' : '⚡ Calcular agora'}
                    </button>
                  </div>
                ) : (() => {
                  const ins = insightCliente
                  const classificacao = ins.classificacao as string | null
                  const tendencia = ins.tendencia as string | null
                  const totalGasto = Number(ins.total_gasto ?? 0)
                  const qtdCompras = Number(ins.qtd_compras ?? 0)
                  const ticketMedio = Number(ins.ticket_medio ?? 0)
                  const diasSem = Number(ins.dias_sem_comprar ?? 0)
                  const ritmo = ins.ritmo_compra_dias as number | null
                  const mesPico = ins.mes_pico as string | null
                  const marcas = (ins.marcas_favoritas as string[] | null) ?? []
                  const tamanhos = (ins.tamanhos as string[] | null) ?? []

                  const classMap: Record<string, { label: string; cor: string }> = {
                    vip:       { label: 'VIP', cor: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
                    frequente: { label: 'Frequente', cor: 'text-[#3B6FFF] bg-[#3B6FFF]/10 border-[#3B6FFF]/30' },
                    ocasional: { label: 'Ocasional', cor: 'text-zinc-300 bg-zinc-700/40 border-zinc-600/30' },
                    inativo:   { label: 'Inativo', cor: 'text-red-400 bg-red-400/10 border-red-400/30' },
                  }
                  const tendMap: Record<string, { label: string; emoji: string }> = {
                    aquecendo:   { label: 'Aquecendo', emoji: '🔥' },
                    estavel:     { label: 'Estável', emoji: '✅' },
                    esfriando:   { label: 'Esfriando', emoji: '❄️' },
                    desaparecendo: { label: 'Sumindo', emoji: '⚠️' },
                  }

                  const cls = classificacao ? classMap[classificacao] : null
                  const tend = tendencia ? tendMap[tendencia] : null

                  const mesesPt: Record<string, string> = {
                    '01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril',
                    '05':'Maio','06':'Junho','07':'Julho','08':'Agosto',
                    '09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro',
                  }
                  const mesPicoLabel = mesPico ? mesesPt[mesPico.slice(5)] ?? mesPico : null

                  return (
                    <div className="space-y-4">
                      {/* Classificação + Tendência */}
                      <div className="flex gap-2 flex-wrap">
                        {cls && (
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cls.cor}`}>{cls.label}</span>
                        )}
                        {tend && (
                          <span className="text-xs font-medium px-3 py-1 rounded-full border border-zinc-700 text-zinc-300 bg-zinc-800">
                            {tend.emoji} {tend.label}
                          </span>
                        )}
                        {diasSem > 0 && (
                          <span className={`text-xs font-medium px-3 py-1 rounded-full border ${diasSem > (ritmo ?? 60) * 1.4 ? 'text-red-400 bg-red-400/10 border-red-400/30' : 'border-zinc-700 text-zinc-400 bg-zinc-800'}`}>
                            {diasSem}d sem comprar
                          </span>
                        )}
                      </div>

                      {/* Números */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-xl p-3 text-center">
                          <p className="text-lg font-bold text-white">{qtdCompras}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">compras</p>
                        </div>
                        <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-xl p-3 text-center">
                          <p className="text-lg font-bold text-white">R${totalGasto.toFixed(0)}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">total gasto</p>
                        </div>
                        <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-xl p-3 text-center">
                          <p className="text-lg font-bold text-white">R${ticketMedio.toFixed(0)}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">ticket médio</p>
                        </div>
                      </div>

                      {/* O que a IA aprendeu */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-[#00D4AA] uppercase tracking-wider">O que a IA aprendeu</p>
                          <button
                            onClick={() => editing && calcularInsight(editing)}
                            disabled={calculandoInsight}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition cursor-pointer"
                          >
                            {calculandoInsight ? 'Calculando...' : '↺ Atualizar'}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {ritmo && (
                            <div className="flex items-start gap-2">
                              <span className="text-base">🔄</span>
                              <p className="text-sm text-zinc-300">Compra a cada <span className="text-white font-medium">~{ritmo} dias</span></p>
                            </div>
                          )}
                          {mesPicoLabel && (
                            <div className="flex items-start gap-2">
                              <span className="text-base">📅</span>
                              <p className="text-sm text-zinc-300">Pico de compras em <span className="text-white font-medium">{mesPicoLabel}</span></p>
                            </div>
                          )}
                          {marcas.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-base">🏷️</span>
                              <p className="text-sm text-zinc-300">Marcas favoritas: <span className="text-white font-medium">{marcas.join(', ')}</span></p>
                            </div>
                          )}
                          {tamanhos.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-base">📏</span>
                              <p className="text-sm text-zinc-300">Tamanhos: <span className="text-white font-medium">{tamanhos.join(', ')}</span></p>
                            </div>
                          )}
                          {!ritmo && !mesPicoLabel && marcas.length === 0 && (
                            <p className="text-sm text-zinc-500">Ainda coletando padrões de comportamento...</p>
                          )}
                        </div>
                      </div>

                      {/* Alerta de risco */}
                      {ritmo && diasSem > ritmo * 1.4 && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                          <p className="text-sm font-medium text-red-400">⚠️ Fora do ritmo</p>
                          <p className="text-xs text-red-300/70 mt-1">
                            Esse cliente compra a cada ~{ritmo} dias mas está há {diasSem} dias sem aparecer. Hora de entrar em contato.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Drawer body — aba Cadastro */}
            {(!editing || drawerTab === 'dados') && (
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col gap-5">

              <Field label="Nome *">
                <input
                  type="text"
                  value={form.nome}
                  onChange={field('nome')}
                  placeholder="Nome completo"
                  className={INPUT}
                />
              </Field>

              <Field label="Telefone">
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={field('telefone')}
                  placeholder="(11) 99999-9999"
                  className={INPUT}
                />
              </Field>

              <Field label="Gênero">
                <div className="flex gap-2">
                  {(['M', 'F'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, genero: f.genero === g ? '' : g }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
                        form.genero === g
                          ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {g === 'M' ? 'Masculino' : 'Feminino'}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Tamanhos */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-zinc-300">Tamanhos</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Camiseta">
                    <select value={form.tamanho_camiseta} onChange={field('tamanho_camiseta')} className={`${INPUT} appearance-none px-3`}>
                      <option value="">—</option>
                      {CAMISETAS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Calça">
                    <select value={form.tamanho_calca} onChange={field('tamanho_calca')} className={`${INPUT} appearance-none px-3`}>
                      <option value="">—</option>
                      {CALCAS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Tênis">
                    <select value={form.tamanho_tenis} onChange={field('tamanho_tenis')} className={`${INPUT} appearance-none px-3`}>
                      <option value="">—</option>
                      {TENIS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <Field label="E-mail">
                <input
                  type="email"
                  value={form.email}
                  onChange={field('email')}
                  placeholder="email@exemplo.com"
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de Nascimento">
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={field('data_nascimento')}
                    className={INPUT}
                  />
                </Field>
                <Field label="Dia do Pagamento">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dia_pagamento}
                    onChange={field('dia_pagamento')}
                    placeholder="1 – 31"
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="Observações">
                <textarea
                  value={form.observacoes}
                  onChange={field('observacoes')}
                  placeholder="Anotações sobre o cliente..."
                  rows={4}
                  className={`${INPUT} resize-none`}
                />
              </Field>

              {/* Dependentes */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-300">Dependentes</p>
                  {!addingDep && (
                    <button
                      type="button"
                      onClick={() => { setAddingDep(true); setDepForm({ nome: '', relacao: '', genero: '', tamanho_camiseta: '', tamanho_calca: '', tamanho_tenis: '', data_nascimento: '' }) }}
                      className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer"
                    >
                      + Adicionar
                    </button>
                  )}
                </div>

                {dependentes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {dependentes.map(dep => (
                      <div key={dep.id} className="flex items-center justify-between bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-white">{dep.nome}</p>
                          <p className="text-xs text-zinc-500 capitalize">{dep.relacao} · {dep.genero === 'M' ? 'Masculino' : 'Feminino'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDependentes(ds => ds.filter(d => d.id !== dep.id))}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer shrink-0"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addingDep && (
                  <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">Nome *</label>
                        <input
                          type="text"
                          value={depForm.nome}
                          onChange={e => setDepForm(f => ({ ...f, nome: e.target.value }))}
                          placeholder="Nome"
                          className={INPUT}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">Relação *</label>
                        <select
                          value={depForm.relacao}
                          onChange={e => setDepForm(f => ({ ...f, relacao: e.target.value as Dependente['relacao'] }))}
                          className={`${INPUT} appearance-none px-3`}
                        >
                          <option value="">Selecionar...</option>
                          <option value="marido">Marido</option>
                          <option value="pai">Pai</option>
                          <option value="filho">Filho</option>
                          <option value="filha">Filha</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Gênero *</label>
                      <div className="flex gap-2">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setDepForm(f => ({ ...f, genero: f.genero === g ? '' : g }))}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition cursor-pointer ${
                              depForm.genero === g
                                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                            }`}
                          >
                            {g === 'M' ? 'Masculino' : 'Feminino'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">Camiseta</label>
                        <select value={depForm.tamanho_camiseta} onChange={e => setDepForm(f => ({ ...f, tamanho_camiseta: e.target.value }))} className={`${INPUT} appearance-none px-2 text-xs`}>
                          <option value="">—</option>
                          {CAMISETAS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">Calça</label>
                        <select value={depForm.tamanho_calca} onChange={e => setDepForm(f => ({ ...f, tamanho_calca: e.target.value }))} className={`${INPUT} appearance-none px-2 text-xs`}>
                          <option value="">—</option>
                          {CALCAS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-zinc-400">Tênis</label>
                        <select value={depForm.tamanho_tenis} onChange={e => setDepForm(f => ({ ...f, tamanho_tenis: e.target.value }))} className={`${INPUT} appearance-none px-2 text-xs`}>
                          <option value="">—</option>
                          {TENIS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-400">Data de Nascimento</label>
                      <input
                        type="date"
                        value={depForm.data_nascimento}
                        onChange={e => setDepForm(f => ({ ...f, data_nascimento: e.target.value }))}
                        className={INPUT}
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddingDep(false)}
                        className="flex-1 text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-2 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!depForm.nome.trim() || !depForm.relacao || !depForm.genero) return
                          const newDep: Dependente = {
                            id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            nome: depForm.nome.trim(),
                            relacao: depForm.relacao as Dependente['relacao'],
                            genero: depForm.genero as 'M' | 'F',
                            tamanho_camiseta: depForm.tamanho_camiseta || undefined,
                            tamanho_calca: depForm.tamanho_calca || undefined,
                            tamanho_tenis: depForm.tamanho_tenis || undefined,
                            data_nascimento: depForm.data_nascimento || undefined,
                          }
                          setDependentes(ds => [...ds, newDep])
                          setAddingDep(false)
                        }}
                        className="flex-1 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-lg py-2 transition cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {dependentes.length === 0 && !addingDep && (
                  <p className="text-xs text-zinc-600">Nenhum dependente. Ex: marido, pai, filho.</p>
                )}
              </div>

              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  {formError}
                </p>
              )}
            </div>
            )}

            {/* Drawer footer — só na aba Cadastro */}
            {(!editing || drawerTab === 'dados') && (
            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button
                onClick={closeDrawer}
                className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-2.5 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Adicionar Cliente'}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
