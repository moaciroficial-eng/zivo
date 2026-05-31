'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'

/* ── Types ─────────────────────────────────────────────────── */

type Evento = {
  id: string
  user_id: string
  nome: string
  data: string
  descricao: string | null
  created_at: string
}

type ClienteInfo = {
  id: string
  nome: string
  data_nascimento: string | null
  dia_pagamento: number | null
}

type DayEvent = {
  id: string
  type: 'evento' | 'aniversario' | 'pagamento'
  label: string
  descricao?: string | null
  eventoRef?: Evento
}

type CalCell = { date: string; day: number; inMonth: boolean }

/* ── Constants ──────────────────────────────────────────────── */

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const WEEKDAYS_SHORT = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

const DOT: Record<DayEvent['type'], string> = {
  evento:      'bg-violet-500',
  aniversario: 'bg-rose-500',
  pagamento:   'bg-amber-500',
}
const BADGE: Record<DayEvent['type'], string> = {
  evento:      'bg-violet-500/15 text-violet-300 border-violet-500/25',
  aniversario: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  pagamento:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
}
const TYPE_LABEL: Record<DayEvent['type'], string> = {
  evento:      'Evento',
  aniversario: 'Aniversário',
  pagamento:   'Pagamento',
}

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]'

/* ── Calendar helpers ───────────────────────────────────────── */

function pad(n: number) { return String(n).padStart(2, '0') }

function buildGrid(year: number, month: number): CalCell[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()           // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1        // Mon-first

  const prevYear  = month === 0  ? year - 1 : year
  const prevMonth = month === 0  ? 11 : month - 1
  const nextYear  = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0  : month + 1
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate()

  const cells: CalCell[] = []

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ date: `${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`, day: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad(month + 1)}-${pad(d)}`, day: d, inMonth: true })
  }
  let d = 1
  while (cells.length < 42) {
    cells.push({ date: `${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`, day: d, inMonth: false })
    d++
  }
  return cells
}

function getEventsForDay(date: string, eventos: Evento[], clientes: ClienteInfo[]): DayEvent[] {
  const [, m, day] = date.split('-').map(Number)
  const list: DayEvent[] = []

  eventos.filter(e => e.data === date).forEach(e =>
    list.push({ id: e.id, type: 'evento', label: e.nome, descricao: e.descricao, eventoRef: e })
  )
  clientes.filter(c => {
    if (!c.data_nascimento) return false
    const [, cm, cd] = c.data_nascimento.split('-').map(Number)
    return cm === m && cd === day
  }).forEach(c => list.push({ id: `bday-${c.id}`, type: 'aniversario', label: c.nome }))

  clientes.filter(c => c.dia_pagamento === day).forEach(c =>
    list.push({ id: `pay-${c.id}`, type: 'pagamento', label: c.nome })
  )
  return list
}

function formatFullDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${d} de ${MONTHS[m - 1]} de ${y}`
}

function formatShortDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${pad(d)}/${pad(m)}/${y}`
}

/* ── Sub-components ─────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

/* ── Icons ──────────────────────────────────────────────────── */

const IconPlus  = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconChevL = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
const IconChevR = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
const IconEdit  = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconX     = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck = ({ size = 14 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconCal   = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>

/* ── NavBar — shared across all pages ──────────────────────── */

function NavBar({ user, active }: { user: { email: string }; active: 'calendario' }) {
  const links = [
    { href: '/dashboard',            label: 'Dashboard'     },
    { href: '/clientes',             label: 'Clientes'      },
    { href: '/vendas',               label: 'Vendas'        },
    { href: '/calendario',           label: 'Calendário'    },
    { href: '/estoque',              label: 'Estoque'       },
    { href: '/configuracoes/marcas', label: 'Configurações' },
  ]
  return (
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
            <span className="font-bold text-white">zivo</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {links.map(l => (
              l.href === `/${active}`
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
  )
}

/* ── Main component ─────────────────────────────────────────── */

export default function CalendarioClient({
  user,
  initialEventos,
  clientes,
}: {
  user: { id: string; email: string }
  initialEventos: Evento[]
  clientes: ClienteInfo[]
}) {
  const supabase = createClient()
  const [eventos, setEventos] = useState(initialEventos)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [editing, setEditing] = useState<Evento | null>(null)
  const [form, setForm] = useState({ nome: '', data: '', descricao: '' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const todayStr = new Date().toISOString().split('T')[0]
  const grid = buildGrid(year, month)

  /* ── Month nav ── */

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday   = () => { setCurrentDate(new Date()); setSelectedDate(todayStr) }

  /* ── Drawer ── */

  function openNew(date?: string) {
    setEditing(null)
    setForm({ nome: '', data: date ?? selectedDate ?? todayStr, descricao: '' })
    setFormError('')
    setDrawer(true)
  }

  function openEdit(e: Evento) {
    setEditing(e)
    setForm({ nome: e.nome, data: e.data, descricao: e.descricao ?? '' })
    setFormError('')
    setDrawer(true)
  }

  function closeDrawer() { setDrawer(false); setEditing(null); setFormError('') }

  /* ── Toast ── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Save ── */

  async function handleSave() {
    if (!form.nome.trim()) { setFormError('Nome do evento é obrigatório.'); return }
    if (!form.data)        { setFormError('Data é obrigatória.'); return }
    setSaving(true); setFormError('')

    const payload = {
      nome: form.nome.trim(),
      data: form.data,
      descricao: form.descricao.trim() || null,
    }

    if (editing) {
      const { data, error } = await supabase.from('eventos').update(payload).eq('id', editing.id).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setEventos(es => es.map(e => e.id === editing.id ? data : e))
      showToast('Evento atualizado.')
    } else {
      const { data, error } = await supabase.from('eventos').insert(payload).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setEventos(es => [...es, data].sort((a, b) => a.data.localeCompare(b.data)))
      setSelectedDate(form.data)
      showToast('Evento adicionado.')
    }
    setSaving(false); closeDrawer()
  }

  /* ── Delete ── */

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (!error) { setEventos(es => es.filter(e => e.id !== id)); showToast('Evento removido.') }
    else showToast(error.message, 'error')
    setDeleting(null); setConfirmDelete(null)
  }

  /* ── Derived ── */

  const selectedDayEvents = selectedDate
    ? getEventsForDay(selectedDate, eventos, clientes)
    : []

  const upcomingEventos = eventos
    .filter(e => e.data >= todayStr)
    .slice(0, 8)

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <NavBar user={user} active="calendario" />

      <main className="max-w-6xl mx-auto px-6 py-8">

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

        {/* Month nav */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconChevL /></button>
            <h2 className="text-xl font-bold w-48 text-center">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconChevR /></button>
            <button
              onClick={goToday}
              className="ml-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
            >
              Hoje
            </button>
          </div>
          <button
            onClick={() => openNew()}
            onTouchEnd={(e) => { e.preventDefault(); openNew(); }}
            className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 transition cursor-pointer shadow-lg shadow-violet-500/20"
          >
            <IconPlus /> Novo Evento
          </button>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* ── Calendar grid ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-zinc-800">
              {WEEKDAYS_SHORT.map(w => (
                <div key={w} className="py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {w}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 divide-x divide-zinc-800/50">
              {grid.map((cell, i) => {
                const isToday    = cell.date === todayStr
                const isSelected = cell.date === selectedDate
                const evts       = getEventsForDay(cell.date, eventos, clientes)
                const rowBorder  = i % 7 === 0 && i > 0 ? 'border-t border-zinc-800/50' : ''

                return (
                  <button
                    key={cell.date}
                    onClick={() => setSelectedDate(prev => prev === cell.date ? null : cell.date)}
                    className={`relative min-h-[88px] p-2 flex flex-col items-start gap-1 text-left transition cursor-pointer
                      ${rowBorder}
                      ${isSelected ? 'bg-violet-500/10' : 'hover:bg-white/[0.03]'}
                      ${!cell.inMonth ? 'opacity-35' : ''}
                    `}
                  >
                    {/* Day number */}
                    <span className={`w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full transition
                      ${isToday    ? 'bg-violet-500 text-white font-bold' : ''}
                      ${isSelected && !isToday ? 'bg-zinc-700 text-white' : ''}
                      ${!isToday && !isSelected ? 'text-zinc-300' : ''}
                    `}>
                      {cell.day}
                    </span>

                    {/* Event chips — desktop shows label, mobile shows dots */}
                    <div className="w-full flex flex-col gap-0.5">
                      {evts.slice(0, 2).map(e => (
                        <span key={e.id} className={`hidden sm:flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 border truncate ${BADGE[e.type]}`}>
                          <span className={`w-1 h-1 rounded-full shrink-0 ${DOT[e.type]}`}/>
                          <span className="truncate">{e.label}</span>
                        </span>
                      ))}
                      {/* Mobile: dots only */}
                      <div className="flex sm:hidden gap-1 flex-wrap mt-0.5">
                        {evts.slice(0, 4).map(e => (
                          <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${DOT[e.type]}`}/>
                        ))}
                      </div>
                      {evts.length > 2 && (
                        <span className="hidden sm:block text-[10px] text-zinc-500 px-1.5">+{evts.length - 2}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="flex flex-col gap-4">

            {/* Selected day panel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              {selectedDate ? (
                <>
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Dia selecionado</p>
                      <p className="font-semibold text-sm leading-snug">{formatFullDate(selectedDate)}</p>
                    </div>
                    <button
                      onClick={() => openNew(selectedDate)}
                      className="shrink-0 p-1.5 text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition cursor-pointer"
                      title="Adicionar evento neste dia"
                    >
                      <IconPlus />
                    </button>
                  </div>

                  {selectedDayEvents.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                        <IconCal />
                      </div>
                      <p className="text-zinc-500 text-sm">Nenhum evento</p>
                      <button
                        onClick={() => openNew(selectedDate)}
                        className="text-xs text-violet-400 hover:text-violet-300 transition"
                      >
                        Adicionar evento
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDayEvents.map(e => (
                        <div key={e.id} className="flex items-start gap-3 p-3 bg-zinc-800/70 rounded-xl group/item">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${DOT[e.type]}`}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{e.label}</p>
                            {e.descricao && <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{e.descricao}</p>}
                            <p className={`text-xs mt-1 font-medium ${
                              e.type === 'evento' ? 'text-violet-400' : e.type === 'aniversario' ? 'text-rose-400' : 'text-amber-400'
                            }`}>{TYPE_LABEL[e.type]}</p>
                          </div>
                          {/* Only manual eventos have edit/delete */}
                          {e.type === 'evento' && e.eventoRef && (
                            <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition">
                              {confirmDelete === e.id ? (
                                <>
                                  <button onClick={() => handleDelete(e.eventoRef!.id)} disabled={deleting === e.id} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer disabled:opacity-50"><IconCheck size={12}/></button>
                                  <button onClick={() => setConfirmDelete(null)} className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition cursor-pointer"><IconX size={12}/></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => openEdit(e.eventoRef!)} className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-700 rounded transition cursor-pointer"><IconEdit /></button>
                                  <button onClick={() => setConfirmDelete(e.id)} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"><IconTrash /></button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Próximos eventos</p>
                  {upcomingEventos.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                        <IconCal />
                      </div>
                      <p className="text-zinc-500 text-sm">Nenhum evento agendado</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {upcomingEventos.map(e => (
                        <button
                          key={e.id}
                          onClick={() => { setSelectedDate(e.data); setCurrentDate(new Date(e.data + 'T12:00:00')) }}
                          className="flex items-start gap-3 p-3 bg-zinc-800/70 hover:bg-zinc-800 rounded-xl text-left transition cursor-pointer group/item w-full"
                        >
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${DOT['evento']}`}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.nome}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{formatShortDate(e.data)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Legend */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Legenda</p>
              <div className="flex flex-col gap-2.5">
                {([
                  ['evento',      'Evento manual'],
                  ['aniversario', 'Aniversário de cliente'],
                  ['pagamento',   'Dia de pagamento'],
                ] as [DayEvent['type'], string][]).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[type]}`}/>
                    <span className="text-sm text-zinc-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Este mês</p>
              <div className="flex flex-col gap-2">
                {(() => {
                  const monthStr = `${year}-${pad(month + 1)}`
                  const thisMonthEventos = eventos.filter(e => e.data.startsWith(monthStr))
                  const birthdays = clientes.filter(c => {
                    if (!c.data_nascimento) return false
                    return c.data_nascimento.slice(5, 7) === pad(month + 1)
                  })
                  const withPayment = clientes.filter(c => c.dia_pagamento != null)
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Eventos</span>
                        <span className="font-semibold text-violet-400">{thisMonthEventos.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Aniversários</span>
                        <span className="font-semibold text-rose-400">{birthdays.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Pagamentos</span>
                        <span className="font-semibold text-amber-400">{withPayment.length}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Drawer ──────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-stretch sm:justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer}/>
          <div className="relative w-full sm:max-w-md bg-zinc-900 border-t border-zinc-800 sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none h-[92vh] sm:h-full flex flex-col shadow-2xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="font-semibold text-lg">{editing ? 'Editar Evento' : 'Novo Evento'}</h2>
              <button onClick={closeDrawer} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX /></button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col gap-5">
              <Field label="Nome do evento *">
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Reunião de equipe"
                  className={INPUT}
                />
              </Field>

              <Field label="Data *">
                <input
                  type="date"
                  value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  className={INPUT}
                />
              </Field>

              <Field label="Descrição">
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Detalhes do evento..."
                  rows={4}
                  className={`${INPUT} resize-none`}
                />
              </Field>

              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  {formError}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={closeDrawer} className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-2.5 transition cursor-pointer">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Criar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
