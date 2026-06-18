'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Contato = {
  id: string
  phone: string
  jid: string | null
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

/* Formata número brasileiro — retorna null se não for número real */
function fmtPhone(phone: string): string | null {
  if (/^55\d{10,11}$/.test(phone)) {
    const local = phone.slice(2)
    return local.length === 11
      ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
      : `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return null  // LID ou formato desconhecido — não exibe
}

/* Extrai número legível a partir do JID completo */
function phoneFromJid(jid: string | null): string | null {
  if (!jid) return null
  if (!jid.endsWith('@s.whatsapp.net')) return null   // @lid ou outro — não é número real
  const raw = jid.replace(/:\d+@.*$/, '').replace(/@.*$/, '')
  return fmtPhone(raw)
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
  const [sendError, setSendError] = useState<string | null>(null)
  const [lidPhone, setLidPhone] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [novaConversa, setNovaConversa] = useState(false)
  const [novaSearch, setNovaSearch] = useState('')
  const [novaNumero, setNovaNumero] = useState('')
  const [clientes, setClientes] = useState<{id:string;nome:string;telefone:string|null}[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedContato = contatos.find(c => c.id === selectedId) ?? null

  /* ── Nova conversa ── */
  async function abrirNovaConversa() {
    setNovaConversa(true)
    setNovaSearch('')
    setNovaNumero('')
    if (clientes.length === 0) {
      const { data } = await supabase.from('clientes').select('id, nome, telefone').order('nome')
      setClientes((data ?? []) as {id:string;nome:string;telefone:string|null}[])
    }
  }

  async function iniciarConversa(phone: string, nome: string) {
    const normalized = phone.replace(/\D/g, '')
    const number = normalized.startsWith('55') ? normalized : `55${normalized}`
    if (!number || number.length < 10) return
    setNovaConversa(false)

    // Verifica se já existe contato
    const existing = contatos.find(c => c.phone === number)
    if (existing) { openContato(existing.id); return }

    // Cria contato no banco e abre a conversa
    const { data: novo } = await supabase.from('whatsapp_contatos').upsert(
      { user_id: user.id, phone: number, nome, funil_etapa: 'desconhecido', nao_lidas: 0 },
      { onConflict: 'user_id,phone' }
    ).select().single()
    if (novo) {
      setContatos(cs => [novo as Contato, ...cs])
      openContato((novo as Contato).id)
    }
  }

  /* ── Status da conexão WhatsApp ── */
  async function checkStatus() {
    setCheckingStatus(true)
    setStatusError(null)
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      setConnected(data.connected)
      setQrcode(data.qrcode ?? null)
      if (data.error) setStatusError(data.error)
    } catch {
      setConnected(false)
      setStatusError('Não foi possível contactar o servidor WhatsApp')
    } finally {
      setCheckingStatus(false)
    }
  }

  async function reconnect() {
    setReconnecting(true)
    setStatusError(null)
    setQrcode(null)
    try {
      // Passo 1: deleta e recria a instância
      const res = await fetch('/api/whatsapp/reconnect', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setStatusError(data.error ?? 'Erro ao reiniciar instância'); setReconnecting(false); return }

      // Passo 2: polling — tenta buscar o QR de 3 em 3 segundos por até 30s
      let attempts = 0
      const maxAttempts = 10
      const poll = async () => {
        attempts++
        try {
          const r = await fetch('/api/whatsapp/reconnect')
          const d = await r.json()
          if (d.qrcode) {
            setQrcode(d.qrcode)
            setConnected(false)
            setReconnecting(false)
          } else if (attempts < maxAttempts) {
            setTimeout(poll, 3000)
          } else {
            setStatusError('QR code não gerado após 30s. Verifique o servidor Evolution API.')
            setReconnecting(false)
          }
        } catch {
          setStatusError('Falha ao buscar QR code')
          setReconnecting(false)
        }
      }
      setTimeout(poll, 3000)
    } catch {
      setStatusError('Falha de conexão com o servidor')
      setReconnecting(false)
    }
  }

  useEffect(() => { checkStatus() }, [])

  /* Busca fotos dos contatos que ainda não têm */
  useEffect(() => {
    const semFoto = contatos.filter(c => !c.foto_url && c.phone)
    if (semFoto.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const c of semFoto) {
        if (cancelled) break
        try {
          const res = await fetch(`/api/whatsapp/foto?phone=${c.phone}&contatoId=${c.id}`)
          const data = await res.json()
          if (data.photo) {
            setContatos(prev => prev.map(x => x.id === c.id ? { ...x, foto_url: data.photo } : x))
          }
        } catch { /* silencioso */ }
      }
    })()
    return () => { cancelled = true }
  }, [contatos.length])

  /* ── Carrega mensagens ao selecionar contato ── */
  useEffect(() => {
    if (!selectedId) { setMensagens([]); return }
    setLoadingMsgs(true)
    supabase
      .from('whatsapp_mensagens')
      .select('id, contato_id, direcao, tipo, conteudo, status, timestamp, raw')
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
        const msg = novo as Mensagem
        setMensagens(prev => {
          /* Substitui mensagem otimista com mesmo conteúdo se existir */
          const tmpIdx = msg.direcao === 'enviada'
            ? prev.findIndex(m => m.id.startsWith('tmp-') && m.conteudo === msg.conteudo)
            : -1
          if (tmpIdx >= 0) {
            const next = [...prev]
            next[tmpIdx] = msg
            return next
          }
          return [...prev, msg]
        })
        if (msg.direcao === 'recebida') {
          supabase.from('whatsapp_contatos').update({ nao_lidas: 0 }).eq('id', selectedId)
          setContatos(cs => cs.map(c => c.id === selectedId ? { ...c, nao_lidas: 0 } : c))
        }
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
    setSendError(null)

    const isLid = selectedContato.jid?.endsWith('@lid')
    const override = isLid ? lidPhone[selectedContato.id]?.replace(/\D/g, '') : undefined

    /* Adiciona mensagem otimisticamente na UI */
    const msgOtimista: Mensagem = {
      id: `tmp-${Date.now()}`,
      contato_id: selectedContato.id,
      direcao: 'enviada',
      tipo: 'texto',
      conteudo: text,
      status: 'enviada',
      timestamp: new Date().toISOString(),
    }
    setMensagens(prev => [...prev, msgOtimista])
    setContatos(cs => cs.map(c => c.id === selectedContato.id
      ? { ...c, ultima_mensagem: text, ultima_mensagem_at: msgOtimista.timestamp }
      : c
    ))

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: override ?? selectedContato.phone,
          message: text,
          contatoId: selectedContato.id,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        setSendError(errText || `Erro ${res.status}`)
        setMensagens(prev => prev.filter(m => m.id !== msgOtimista.id))
        setTimeout(() => setSendError(null), 8000)
      }
    } catch (e) {
      setSendError('Falha de conexão')
      setMensagens(prev => prev.filter(m => m.id !== msgOtimista.id))
      setTimeout(() => setSendError(null), 6000)
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
    <div className="flex-1 flex flex-col bg-[#09090b] text-white overflow-hidden">

      {/* ── Painel de status da conexão ── */}
      {connected === false && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-4 flex flex-col items-center gap-3">
          {qrcode ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-semibold text-amber-400">Escaneie o QR code com o WhatsApp</p>
              <img src={qrcode} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border border-zinc-700 bg-white p-1" />
              <div className="flex gap-2">
                <button onClick={checkStatus} disabled={checkingStatus}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 transition cursor-pointer disabled:opacity-50">
                  {checkingStatus ? 'Verificando...' : 'Já escaneei ✓'}
                </button>
                <button onClick={reconnect} disabled={reconnecting}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-4 py-2 transition cursor-pointer disabled:opacity-50">
                  {reconnecting ? 'Gerando...' : 'Novo QR code'}
                </button>
              </div>
              {statusError && <p className="text-xs text-red-400">{statusError}</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <p className="text-sm font-semibold text-red-400">WhatsApp desconectado</p>
              </div>
              {statusError && <p className="text-xs text-zinc-500">{statusError}</p>}
              <div className="flex gap-2 mt-1">
                <button onClick={reconnect} disabled={reconnecting}
                  className="text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 transition cursor-pointer disabled:opacity-50">
                  {reconnecting ? 'Gerando QR code...' : 'Gerar QR code'}
                </button>
                <button onClick={checkStatus} disabled={checkingStatus}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-4 py-2 transition cursor-pointer disabled:opacity-50">
                  {checkingStatus ? 'Verificando...' : 'Verificar conexão'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {connected === true && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <p className="text-xs text-emerald-400 font-medium">WhatsApp conectado</p>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Lista de contatos ── */}
        <aside className={`
          ${view === 'chat' ? 'hidden' : 'flex'} md:flex relative
          flex-col w-full md:w-72 lg:w-80 border-r border-zinc-800 shrink-0 bg-zinc-950
        `}>
          <div className="p-3 border-b border-zinc-800 flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors [color-scheme:dark]"
            />
            <button
              onClick={abrirNovaConversa}
              title="Nova conversa"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 transition shrink-0 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* Modal nova conversa */}
          {novaConversa && (
            <div className="absolute inset-0 z-50 bg-zinc-950/95 flex flex-col" style={{width: 'inherit', maxWidth: 'inherit'}}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                <button onClick={() => setNovaConversa(false)} className="text-zinc-400 hover:text-white transition cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <h2 className="text-sm font-semibold">Nova conversa</h2>
              </div>

              {/* Digitar número avulso */}
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">Número avulso</p>
                <div className="flex gap-2">
                  <input
                    value={novaNumero}
                    onChange={e => setNovaNumero(e.target.value)}
                    placeholder="(62) 99999-9999"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-violet-500 [color-scheme:dark]"
                    onKeyDown={e => e.key === 'Enter' && novaNumero.trim() && iniciarConversa(novaNumero, novaNumero)}
                  />
                  <button
                    onClick={() => novaNumero.trim() && iniciarConversa(novaNumero, novaNumero)}
                    className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition cursor-pointer"
                  >
                    Ir
                  </button>
                </div>
              </div>

              {/* Clientes cadastrados */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs text-zinc-500 mb-2">Clientes cadastrados</p>
                <input
                  value={novaSearch}
                  onChange={e => setNovaSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-violet-500 [color-scheme:dark]"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {clientes
                  .filter(c => c.telefone && (
                    c.nome.toLowerCase().includes(novaSearch.toLowerCase()) ||
                    (c.telefone ?? '').includes(novaSearch)
                  ))
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => iniciarConversa(c.telefone!, c.nome)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 transition cursor-pointer text-left border-b border-zinc-800/30"
                    >
                      <div className="w-9 h-9 rounded-full bg-violet-600/20 text-violet-300 flex items-center justify-center text-sm font-semibold shrink-0 uppercase">
                        {c.nome[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{c.nome}</p>
                        <p className="text-xs text-zinc-500">{c.telefone}</p>
                      </div>
                    </button>
                  ))
                }
                {clientes.filter(c => c.telefone).length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-6">Nenhum cliente com telefone cadastrado.</p>
                )}
              </div>
            </div>
          )}

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
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-sm font-semibold text-zinc-200 uppercase select-none overflow-hidden">
                  {c.foto_url
                    ? <img src={c.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : (c.nome ?? c.phone)[0]
                  }
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
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-semibold uppercase text-zinc-200 select-none overflow-hidden">
                  {selectedContato.foto_url
                    ? <img src={selectedContato.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : (selectedContato.nome ?? selectedContato.phone)[0]
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {selectedContato.nome ?? phoneFromJid(selectedContato.jid) ?? selectedContato.phone}
                  </p>
                  {(phoneFromJid(selectedContato.jid) ?? fmtPhone(selectedContato.phone)) && (
                    <p className="text-[11px] text-zinc-500">
                      {phoneFromJid(selectedContato.jid) ?? fmtPhone(selectedContato.phone)}
                    </p>
                  )}
                  {selectedContato.jid?.endsWith('@lid') && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-yellow-500 shrink-0">ID privado — insira o número:</span>
                      <input
                        value={lidPhone[selectedContato.id] ?? ''}
                        onChange={e => setLidPhone(m => ({ ...m, [selectedContato.id]: e.target.value }))}
                        placeholder="5562999057784"
                        className="text-[11px] bg-zinc-800 border border-yellow-600/40 rounded px-2 py-0.5 text-zinc-200 w-36 outline-none focus:border-yellow-500 [color-scheme:dark]"
                      />
                    </div>
                  )}
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
                {mensagens.map(m => {
                  const enviada = m.direcao === 'enviada'
                  const raw = (m as unknown as Record<string, unknown>).raw as Record<string, unknown> | null | undefined
                  const imageUrl = (raw?.image as Record<string, unknown> | undefined)?.imageUrl as string | undefined
                  const audioUrl = (raw?.audio as Record<string, unknown> | undefined)?.audioUrl as string | undefined
                  return (
                    <div key={m.id} className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl overflow-hidden text-sm ${
                        enviada ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`}>
                        {/* Imagem */}
                        {m.tipo === 'imagem' && imageUrl && (
                          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                            <img src={imageUrl} alt="imagem" className="max-w-full max-h-64 object-cover" />
                          </a>
                        )}
                        {/* Áudio */}
                        {m.tipo === 'audio' && audioUrl && (
                          <div className="px-3 pt-2">
                            <audio controls src={audioUrl} className="w-full h-8" />
                          </div>
                        )}
                        {/* Texto / legenda / fallback */}
                        <div className="px-3 py-2">
                          {m.conteudo && m.conteudo !== '📷 Imagem' && m.conteudo !== '🎵 Áudio' ? (
                            <p className="whitespace-pre-wrap break-words leading-snug">{m.conteudo}</p>
                          ) : m.tipo !== 'imagem' && m.tipo !== 'audio' ? (
                            <p className="whitespace-pre-wrap break-words leading-snug text-zinc-400 italic">{m.conteudo ?? `[${m.tipo}]`}</p>
                          ) : null}
                          <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${enviada ? 'text-violet-300' : 'text-zinc-500'}`}>
                            {fmtTime(m.timestamp)}
                            {enviada && (
                              <span className={m.status === 'lida' ? 'text-blue-300' : ''}>
                                {m.status === 'lida' ? '✓✓' : m.status === 'entregue' ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input de envio */}
              {sendError && (
                <div className="mx-3 mb-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                  {sendError}
                </div>
              )}
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

    </div>
  )
}
