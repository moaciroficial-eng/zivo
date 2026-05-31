'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'

type Marca = {
  id: string
  nome: string
  markup: number
}

const NAV_LINKS = [
  { href: '/dashboard',             label: 'Dashboard'      },
  { href: '/clientes',              label: 'Clientes'       },
  { href: '/vendas',                label: 'Vendas'         },
  { href: '/calendario',            label: 'Calendário'     },
  { href: '/estoque',               label: 'Estoque'        },
  { href: '/configuracoes/marcas',  label: 'Configurações'  },
]

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]'

const IconTrash  = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IconEdit   = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconCheck  = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconX      = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconPlus   = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>

export default function MarcasClient({
  user,
  initialMarcas,
}: {
  user: { id: string; email: string }
  initialMarcas: Marca[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [marcas, setMarcas] = useState<Marca[]>(initialMarcas)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editMarkup, setEditMarkup] = useState('')
  const [newNome, setNewNome] = useState('')
  const [newMarkup, setNewMarkup] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(m: Marca) {
    setEditingId(m.id)
    setEditNome(m.nome)
    setEditMarkup(String(m.markup))
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setError('')
  }

  async function saveEdit(id: string) {
    const nome = editNome.trim()
    const markup = parseFloat(editMarkup)
    if (!nome) { setError('Nome é obrigatório.'); return }
    if (!markup || markup <= 0) { setError('Markup deve ser maior que zero.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('marcas').update({ nome, markup }).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    setMarcas(ms => ms.map(m => m.id === id ? { ...m, nome, markup } : m))
    setEditingId(null)
    setSaving(false)
  }

  async function deleteMarca(id: string) {
    const { error: err } = await supabase.from('marcas').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setMarcas(ms => ms.filter(m => m.id !== id))
  }

  async function addMarca() {
    const nome = newNome.trim()
    const markup = parseFloat(newMarkup)
    if (!nome) { setError('Nome é obrigatório.'); return }
    if (!markup || markup <= 0) { setError('Markup deve ser maior que zero.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('marcas')
      .insert({ nome, markup, user_id: user.id })
      .select()
      .single()
    if (err || !data) { setError(err?.message ?? 'Erro ao salvar.'); setSaving(false); return }
    setMarcas(ms => [...ms, data])
    setNewNome('')
    setNewMarkup('')
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
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
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    l.href === '/configuracoes/marcas'
                      ? 'font-medium bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {l.label}
                </Link>
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

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Configurações</p>
          <h1 className="text-xl font-bold">Marcas</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Cadastre marcas com markup para calcular automaticamente o preço de custo ao escanear etiquetas.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Header da tabela */}
          <div className="grid grid-cols-[1fr_140px_80px] gap-4 px-5 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            <span>Marca</span>
            <span>Markup</span>
            <span />
          </div>

          {/* Lista */}
          {marcas.length === 0 && editingId === null && (
            <div className="px-5 py-8 text-center text-zinc-600 text-sm">
              Nenhuma marca cadastrada ainda.
            </div>
          )}

          {marcas.map(m => (
            <div key={m.id} className="grid grid-cols-[1fr_140px_80px] gap-4 items-center px-5 py-3.5 border-b border-zinc-800/60 last:border-0">
              {editingId === m.id ? (
                <>
                  <input
                    autoFocus
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(m.id); if (e.key === 'Escape') cancelEdit() }}
                    className={INPUT}
                  />
                  <div className="relative">
                    <input
                      type="number" min="0.01" step="0.01"
                      value={editMarkup}
                      onChange={e => setEditMarkup(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(m.id); if (e.key === 'Escape') cancelEdit() }}
                      placeholder="ex: 2.5"
                      className={INPUT}
                    />
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => saveEdit(m.id)} disabled={saving} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition cursor-pointer"><IconCheck /></button>
                    <button onClick={cancelEdit} className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX /></button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-white">{m.nome}</span>
                  <div className="flex flex-col">
                    <span className="text-sm text-zinc-300">{m.markup}×</span>
                    <span className="text-xs text-zinc-600">custo = venda ÷ {m.markup}</span>
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => startEdit(m)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconEdit /></button>
                    <button onClick={() => deleteMarca(m.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"><IconTrash /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Linha de adição */}
          <div className="grid grid-cols-[1fr_140px_80px] gap-4 items-center px-5 py-3.5 bg-zinc-800/20">
            <input
              value={newNome}
              onChange={e => setNewNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarca() }}
              placeholder="Nome da marca"
              className={INPUT}
            />
            <input
              type="number" min="0.01" step="0.01"
              value={newMarkup}
              onChange={e => setNewMarkup(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarca() }}
              placeholder="ex: 2.5"
              className={INPUT}
            />
            <div className="flex justify-end">
              <button
                onClick={addMarca}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition cursor-pointer"
              >
                <IconPlus />
                Adicionar
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{error}</p>
        )}

        {/* Explicação do markup */}
        <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-400">
          <p className="font-medium text-zinc-300 mb-1">Como funciona o markup?</p>
          <p>Quando o scanner identificar uma marca, o preço de custo é calculado automaticamente:</p>
          <p className="mt-2 font-mono text-xs bg-zinc-800 rounded px-3 py-2 text-zinc-300">
            preço de custo = preço de venda ÷ markup
          </p>
          <p className="mt-2 text-zinc-500 text-xs">Exemplo: venda R$ 100 com markup 2,5 → custo R$ 40</p>
        </div>
      </main>
    </div>
  )
}
