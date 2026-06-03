'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MobileNav from '@/app/components/MobileNav'

type Contato = {
  id: string
  phone: string
  nome: string | null
  foto_url: string | null
  ultima_mensagem: string | null
  ultima_mensagem_at: string | null
  nao_lidas: number
}

type Mensagem = {
  id: string
  contato_id: string
  direcao: 'recebida' | 'enviada'
  tipo: string
  conteudo: string | null
  status: string
  timestamp: string
}

type Props = {
  user: { id: string; email: string }
  initialContatos: Contato[]
}

function fmtTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 86_400_000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diff < 172_800_000) return 'Ontem'
  if (diff < 604_800_000) return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function WhatsAppClient({ user, initialContatos }: Props) {
  const supabase = createClient()
  const [contatos, setContatos] = useState<Contato[]>(initialContatos)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'chat'>('list')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedContato = contatos.find(c => c.id === selectedId) ?? null

  /* ── Carrega mensagens ao selecionar contato ── */
  useEffect(() => {
    if (!selectedId) { setMensagens([]); return }
    setLoadingMsgs(true)
    supabase
      .from('whatsapp_mensagens')
      .select('id, contato_id, direcao, tipo, conteudo, status, timestamp')
      .eq('contato_id', selectedId)
      .order('timestamp', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setMensagens((data ?? []) as Mensagem[])
        setLoadingMsgs(false)
      })
    supabase
      .from('whatsapp_contatos')
      .update({ nao_lidas: 0 })
      .eq('id', selectedId)
      .then(() => setContatos(cs => cs.map(c => c.id === selectedId ? { ...c, nao_lidas: 0 } : c)))
  }, [selectedId])

  /* ── Scroll para o fim ao chegar nova mensagem ── */
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [mensagens.length])

  /* ── Realtime: contatos ── */
  useEffect(() => {
    const ch = supabase
      .channel('wa-contatos-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'whatsapp_contatos',
        filter: `user_id=eq.${user.id}`,
      }, ({ eventType, new: novo }) => {
        const c = novo as Contato
        if (eventType === 'INSERT') {
          setContatos(prev => [c, ...prev])
        } else if (eventType === 'UPDATE') {
          setContatos(prev =>
            prev.map(x => x.id === c.id ? c : x)
               .sort((a, b) => (b.ultima_mensagem_at ?? '').localeCompare(a.ultima_mensagem_at ?? ''))
          )
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user.id])

  /* ── Realtime: mensagens do contato selecionado ── */
  useEffect(() => {
    if (!selectedId) return
    const ch = supabase
      .channel('wa-msgs-' + selectedId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens',
        filter: `contato_id=eq.${selectedId}`,
      }, ({ new: novo }) => {
        setMensagens(prev => [...prev, novo as Mensagem])
        supabase.from('whatsapp_contatos').update({ nao_lidas: 0 }).eq('id', selectedId)
        setContatos(cs => cs.map(c => c.id === selectedId ? { ...c, nao_lidas: 0 } : c))
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'whatsapp_mensagens',
        filter: `contato_id=eq.${selectedId}`,
      }, ({ new: novo }) => {
        setMensagens(prev => prev.map(m => m.id === (novo as Mensagem).id ? novo as Mensagem : m))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId])

  /* ── Enviar mensagem ── */
  async function handleSend() {
    if (!input.trim() || !selectedContato || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedContato.phone, message: text }),
      })
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function openContato(id: string) {
    setSelectedId(id)
    setView('chat')
  }

  const filtered = contatos.filter(c =>
    (c.nome ?? c.phone).toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )

  return (
    <div className="h-screen bg-[#09090b] text-white flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="shrink-0 border-b border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </Link>
          <div className="hidden md:flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
            <span className="text-zinc-700">/</span>
          </div>
          <h1 className="text-sm font-semibold">WhatsApp</h1>
        </div>
        <button onClick={() => logout()} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Sair
        </button>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Lista de contatos ── */}
        <aside className={`
          ${view === 'chat' ? 'hidden' : 'flex'} md:flex
          flex-col w-full md:w-72 lg:w-80 border-r border-zinc-800 shrink-0 bg-zinc-950
        `}>
          <div className="p-3 border-b border-zinc-800">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors [color-scheme:dark]"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-zinc-600 text-sm p-8 leading-relaxed whitespace-pre-line">
                {contatos.length === 0
                  ? 'Nenhuma conversa ainda.\nAguardando mensagens via webhook.'
                  : 'Nenhum resultado.'}
              </p>
            )}
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => openContato(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-zinc-800/40 ${
                  selectedId === c.id ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-sm font-semibold text-zinc-200 uppercase select-none">
                  {(c.nome ?? c.phone)[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-medium truncate">{c.nome ?? c.phone}</span>
                    <span className="text-[10px] text-zinc-500 shrink-0">{fmtTime(c.ultima_mensagem_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="text-xs text-zinc-500 truncate">{c.ultima_mensagem ?? ''}</span>
                    {c.nao_lidas > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Área de chat ── */}
        <main className={`${view === 'list' ? 'hidden' : 'flex'} md:flex flex-1 flex-col overflow-hidden`}>

          {/* Empty state */}
          {!selectedContato && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-700">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          )}

          {selectedContato && (
            <>
              {/* Chat header */}
              <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center gap-3 bg-zinc-950/80 backdrop-blur-sm">
                <button
                  onClick={() => setView('list')}
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                </button>
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-semibold uppercase text-zinc-200 select-none">
                  {(selectedContato.nome ?? selectedContato.phone)[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{selectedContato.nome ?? selectedContato.phone}</p>
                  <p className="text-[11px] text-zinc-500">+{selectedContato.phone}</p>
                </div>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {loadingMsgs && (
                  <p className="text-center text-zinc-600 text-sm py-12">Carregando...</p>
                )}
                {!loadingMsgs && mensagens.length === 0 && (
                  <p className="text-center text-zinc-700 text-sm py-12">Nenhuma mensagem ainda.</p>
                )}
                {mensagens.map(m => (
                  <div key={m.id} className={`flex ${m.direcao === 'enviada' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                      m.direcao === 'enviada'
                        ? 'bg-violet-600 text-white rounded-br-sm'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap break-words leading-snug">
                        {m.conteudo ?? `[${m.tipo}]`}
                      </p>
                      <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${
                        m.direcao === 'enviada' ? 'text-violet-300' : 'text-zinc-500'
                      }`}>
                        {fmtTime(m.timestamp)}
                        {m.direcao === 'enviada' && (
                          <span className={m.status === 'lida' ? 'text-blue-300' : ''}>
                            {m.status === 'lida' ? '✓✓' : m.status === 'entregue' ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input de envio */}
              <div className="shrink-0 p-3 border-t border-zinc-800 flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Digite uma mensagem..."
                  disabled={sending}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors [color-scheme:dark] disabled:opacity-60"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3.5 py-2.5 transition-colors shrink-0"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
