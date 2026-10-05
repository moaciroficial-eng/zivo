'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/app/components/useConfirm'

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
  message_id?: string | null
  raw?: Record<string, unknown> | null
}

type Props = {
  user: { id: string; email: string }
  initialContatos: Contato[]
}

type ProdutoFoto = {
  estoque_id: string
  nome: string
  marca: string | null
  cor: string | null
  preco_venda: number | null
  foto_url: string
  tamanhos: string[]
  serve: boolean
  ja_enviada?: boolean
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

/* Resumo curto de uma mensagem — usado na prévia de "respondendo a ..." */
function resumoMsg(m: Mensagem): string {
  if (m.tipo === 'imagem') return '📷 Foto'
  if (m.tipo === 'audio') return '🎵 Áudio'
  if (m.tipo === 'video') return '🎥 Vídeo'
  if (m.tipo === 'documento') return `📄 ${m.conteudo ?? 'Documento'}`
  if (m.tipo === 'sticker') return '🎯 Figurinha'
  return m.conteudo ?? ''
}

/* Avatar sem foto: cor consistente por contato (a Meta não dá foto de perfil).
   Classes fixas pra o Tailwind não podar. */
const AVATAR_CORES = [
  'bg-[#C79A54]/30 text-[#F0CC88]',
  'bg-blue-600/30 text-blue-200',
  'bg-emerald-600/30 text-emerald-200',
  'bg-amber-600/30 text-amber-200',
  'bg-rose-600/30 text-rose-200',
  'bg-cyan-600/30 text-cyan-200',
  'bg-fuchsia-600/30 text-fuchsia-200',
  'bg-teal-600/30 text-teal-200',
]
function corAvatar(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_CORES[h % AVATAR_CORES.length]
}

/* Emojis mais usados no atendimento — paleta enxuta pro seletor rápido */
const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','🥰','😘','😉','😎',
  '🤔','😅','🙃','😴','😢','😭','😡','🥺','🙏','👍',
  '👎','👏','🙌','💪','👌','🤝','❤️','🧡','💛','💚',
  '💙','💜','🔥','✨','🎉','🎁','💰','✅','❌','⚠️',
  '👋','😃','😄','🤩','😋','😜','🤗','💯','👀','🛍️',
]

/* Reações rápidas (menu de cada mensagem) */
const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export default function WhatsAppClient({ user, initialContatos }: Props) {
  const supabase = createClient()
  const [contatos, setContatos] = useState<Contato[]>(initialContatos)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [enviandoVideo, setEnviandoVideo] = useState(false)
  const [enviandoDoc, setEnviandoDoc] = useState(false)
  const [showAnexo, setShowAnexo] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  // Seletor de produtos do estoque (com foto) pra enviar no chat
  const [showFotoPicker, setShowFotoPicker] = useState(false)
  const [fotoBusca, setFotoBusca] = useState('')
  const [fotoItens, setFotoItens] = useState<ProdutoFoto[]>([])
  const [fotoSel, setFotoSel] = useState<Set<string>>(new Set())
  const [fotoLoading, setFotoLoading] = useState(false)
  const [lidPhone, setLidPhone] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [replyTo, setReplyTo] = useState<Mensagem | null>(null)   // mensagem que estou citando
  const [acaoMsgId, setAcaoMsgId] = useState<string | null>(null) // menu de ação aberto
  const [view, setView] = useState<'list' | 'chat'>('list')
  /* Conexão/QR removidos — Meta oficial não usa QR nem "instância". */
  const [novaConversa, setNovaConversa] = useState(false)
  const [novaSearch, setNovaSearch] = useState('')
  const [novaNumero, setNovaNumero] = useState('')
  const [clientes, setClientes] = useState<{id:string;nome:string;telefone:string|null}[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [confirmUI, pedirConfirm] = useConfirm()

  const selectedContato = contatos.find(c => c.id === selectedId) ?? null

  /* Mapa message_id → mensagem, pra achar a mensagem citada numa resposta */
  const msgPorId = new Map<string, Mensagem>()
  for (const mm of mensagens) if (mm.message_id) msgPorId.set(mm.message_id, mm)

  /* Deep-link: /whatsapp?contato=<id> (vindo de "Clientes para responder" no dashboard) abre a conversa direto */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('contato')
    if (id) setSelectedId(id)
  }, [])

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

  /* Pede permissão de notificação na primeira visita */
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  /* Foto de perfil de contato: a API oficial da Meta NÃO fornece (privacidade),
     ao contrário da Z-API antiga. Então não buscamos — o avatar mostra a
     inicial colorida do nome (ver corAvatar). */

  /* ── Carrega mensagens ao selecionar contato ── */
  useEffect(() => {
    setReplyTo(null); setAcaoMsgId(null)
    if (!selectedId) { setMensagens([]); return }
    setLoadingMsgs(true)
    supabase
      .from('whatsapp_mensagens')
      .select('id, contato_id, direcao, tipo, conteudo, status, timestamp, message_id, raw')
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
    /* Marca como lida no WhatsApp do cliente (✓✓ azul) — best-effort */
    fetch('/api/whatsapp/marcar-lida', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contatoId: selectedId }),
    }).catch(() => null)
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
          /* Notificação do navegador se não estiver com o foco */
          if (document.hidden || document.visibilityState !== 'visible') {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const nome = contatos.find(c => c.id === selectedId)?.nome ?? 'WhatsApp'
              new Notification(nome, { body: msg.conteudo ?? '📷 Mídia', icon: '/icon.png', tag: 'wa-msg' })
            }
          }
          /* Som suave */
          try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const g = ctx.createGain()
            osc.connect(g); g.connect(ctx.destination)
            osc.frequency.value = 840
            g.gain.setValueAtTime(0.15, ctx.currentTime)
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
            osc.start(); osc.stop(ctx.currentTime + 0.25)
          } catch { /* silencioso se bloqueado */ }
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

  /* Reagir a uma mensagem com emoji */
  async function reagir(m: Mensagem, emoji: string) {
    setAcaoMsgId(null)
    if (!selectedContato || !m.message_id) return
    const nota: Mensagem = {
      id: `tmp-r-${Date.now()}`, contato_id: selectedContato.id,
      direcao: 'enviada', tipo: 'reacao', conteudo: `reagiu ${emoji}`,
      status: 'enviada', timestamp: new Date().toISOString(),
    }
    setMensagens(prev => [...prev, nota])
    try {
      await fetch('/api/whatsapp/reagir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoId: selectedContato.id, messageId: m.message_id, emoji }),
      })
    } catch { /* silencioso */ }
  }

  /* ── Enviar mensagem ── */
  async function handleSend() {
    if (!input.trim() || !selectedContato || sending) return
    const text = input.trim()
    const citada = replyTo
    setInput('')
    setReplyTo(null)
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
      raw: citada?.message_id ? { context: { id: citada.message_id } } : null,
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
          contextMessageId: citada?.message_id ?? undefined,
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

  /* Busca de produtos com foto — debounce ao digitar */
  useEffect(() => {
    if (!showFotoPicker) return
    const t = setTimeout(() => { carregarProdutosFoto(fotoBusca) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoBusca, showFotoPicker])

  /* ── Enviar foto ── */
  async function comprimir(file: File): Promise<Blob> {
    return new Promise(resolve => {
      const img = document.createElement('img')
      img.onload = () => {
        const scale = Math.min(1, 1600 / img.naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => resolve(b ?? file), 'image/jpeg', 0.85)
        URL.revokeObjectURL(img.src)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  /* Envia uma imagem já hospedada (URL) — usado pelo upload e pelo seletor de estoque */
  async function enviarImagemUrl(imageUrl: string, caption?: string): Promise<boolean> {
    if (!selectedContato) return false
    const isLid = selectedContato.jid?.endsWith('@lid')
    const override = isLid ? lidPhone[selectedContato.id]?.replace(/\D/g, '') : undefined
    const msgOtimista = {
      id: `tmp-${Date.now()}-${Math.random()}`,
      contato_id: selectedContato.id,
      direcao: 'enviada',
      tipo: 'imagem',
      conteudo: caption?.trim() || '📷 Imagem',
      status: 'enviada',
      timestamp: new Date().toISOString(),
      raw: { image: { imageUrl, caption: caption ?? null } },
    } as unknown as Mensagem
    setMensagens(prev => [...prev, msgOtimista])
    try {
      const res = await fetch('/api/whatsapp/send-imagem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: override ?? selectedContato.phone, imageUrl, caption, contatoId: selectedContato.id }),
      })
      if (!res.ok) {
        const errText = await res.text()
        setSendError(errText || `Erro ${res.status}`)
        setMensagens(prev => prev.filter(m => m.id !== msgOtimista.id))
        setTimeout(() => setSendError(null), 8000)
        return false
      }
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Falha ao enviar a foto')
      setMensagens(prev => prev.filter(m => m.id !== msgOtimista.id))
      setTimeout(() => setSendError(null), 6000)
      return false
    }
  }

  async function handleSendVideo(file: File) {
    if (!selectedContato || enviandoVideo) return
    if (file.size > 16 * 1024 * 1024) {
      setSendError('Vídeo muito grande — a Meta aceita até 16MB.')
      setTimeout(() => setSendError(null), 6000)
      return
    }
    setEnviandoVideo(true)
    setSendError(null)
    const isLid = selectedContato.jid?.endsWith('@lid')
    const override = isLid ? lidPhone[selectedContato.id]?.replace(/\D/g, '') : undefined
    let msgId = ''
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id ?? 'anon'
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
      const path = `whatsapp/${uid}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('biblioteca').upload(path, file, { contentType: file.type || 'video/mp4' })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('biblioteca').getPublicUrl(up.path)
      msgId = `tmp-v-${Date.now()}`
      const msgOtimista = {
        id: msgId, contato_id: selectedContato.id, direcao: 'enviada', tipo: 'video',
        conteudo: '🎥 Vídeo', status: 'enviada', timestamp: new Date().toISOString(),
        raw: { video: { videoUrl: pub.publicUrl } },
      } as unknown as Mensagem
      setMensagens(prev => [...prev, msgOtimista])
      const res = await fetch('/api/whatsapp/send-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: override ?? selectedContato.phone, videoUrl: pub.publicUrl, contatoId: selectedContato.id }),
      })
      if (!res.ok) {
        const t = await res.text()
        setSendError(t || 'Falha ao enviar o vídeo')
        setMensagens(prev => prev.filter(m => m.id !== msgId))
        setTimeout(() => setSendError(null), 8000)
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Falha ao enviar o vídeo')
      if (msgId) setMensagens(prev => prev.filter(m => m.id !== msgId))
      setTimeout(() => setSendError(null), 6000)
    } finally {
      setEnviandoVideo(false)
    }
  }

  async function handleSendDocument(file: File) {
    if (!selectedContato || enviandoDoc) return
    if (file.size > 32 * 1024 * 1024) {
      setSendError('Arquivo muito grande (máx. 32MB).')
      setTimeout(() => setSendError(null), 6000)
      return
    }
    setEnviandoDoc(true)
    setSendError(null)
    const isLid = selectedContato.jid?.endsWith('@lid')
    const override = isLid ? lidPhone[selectedContato.id]?.replace(/\D/g, '') : undefined
    let msgId = ''
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id ?? 'anon'
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const path = `whatsapp/${uid}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('biblioteca').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('biblioteca').getPublicUrl(up.path)
      msgId = `tmp-d-${Date.now()}`
      const msgOtimista = {
        id: msgId, contato_id: selectedContato.id, direcao: 'enviada', tipo: 'documento',
        conteudo: file.name, status: 'enviada', timestamp: new Date().toISOString(),
        raw: { document: { url: pub.publicUrl, fileName: file.name } },
      } as unknown as Mensagem
      setMensagens(prev => [...prev, msgOtimista])
      const res = await fetch('/api/whatsapp/send-documento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: override ?? selectedContato.phone, documentUrl: pub.publicUrl, filename: file.name, contatoId: selectedContato.id }),
      })
      if (!res.ok) {
        const t = await res.text()
        setSendError(t || 'Falha ao enviar o documento')
        setMensagens(prev => prev.filter(m => m.id !== msgId))
        setTimeout(() => setSendError(null), 8000)
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Falha ao enviar o documento')
      if (msgId) setMensagens(prev => prev.filter(m => m.id !== msgId))
      setTimeout(() => setSendError(null), 6000)
    } finally {
      setEnviandoDoc(false)
    }
  }

  async function handleSendImage(file: File) {
    if (!selectedContato || enviandoFoto) return
    setEnviandoFoto(true)
    setSendError(null)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id ?? 'anon'
      const blob = await comprimir(file)
      const path = `whatsapp/${uid}/${Date.now()}.jpg`
      const { data: up, error: upErr } = await supabase.storage.from('biblioteca').upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('biblioteca').getPublicUrl(up.path)
      await enviarImagemUrl(pub.publicUrl)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Falha ao enviar a foto')
      setTimeout(() => setSendError(null), 6000)
    } finally {
      setEnviandoFoto(false)
    }
  }

  /* ── Seletor de produtos do estoque (com foto) ── */
  async function abrirPickerFotos() {
    setShowFotoPicker(true)
    setFotoSel(new Set())
    setFotoBusca('')
    await carregarProdutosFoto('')
  }

  async function carregarProdutosFoto(q: string) {
    if (!selectedContato) return
    setFotoLoading(true)
    try {
      const res = await fetch('/api/whatsapp/produtos-foto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoId: selectedContato.id, q }),
      })
      const d = await res.json().catch(() => ({}))
      setFotoItens(d?.itens ?? [])
    } catch {
      setFotoItens([])
    } finally {
      setFotoLoading(false)
    }
  }

  async function enviarFotosSelecionadas() {
    const escolhidas = fotoItens.filter(i => fotoSel.has(i.estoque_id))
    if (escolhidas.length === 0) return
    setEnviandoFoto(true)
    setShowFotoPicker(false)
    for (const it of escolhidas) {
      const legenda = [it.nome, it.marca].filter(Boolean).join(' ')
        + (it.preco_venda ? ` — R$${Number(it.preco_venda).toFixed(0)}` : '')
      await enviarImagemUrl(it.foto_url, legenda)
    }
    setEnviandoFoto(false)
    setFotoSel(new Set())
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
    <div className="flex flex-col bg-[#09090b] text-white overflow-hidden h-[calc(100dvh-3.25rem)] lg:h-screen">
      {confirmUI}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Lista de contatos ── */}
        <aside className={`
          ${view === 'chat' ? 'hidden' : 'flex'} lg:flex relative
          flex-col w-full lg:w-80 border-r border-zinc-800 shrink-0 bg-zinc-950 min-h-0
        `}>
          <div className="p-3 border-b border-zinc-800 flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] transition-colors [color-scheme:dark]"
            />
            <button
              onClick={abrirNovaConversa}
              title="Nova conversa"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#C79A54] hover:bg-[#C79A54] transition shrink-0 cursor-pointer"
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
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
                    onKeyDown={e => e.key === 'Enter' && novaNumero.trim() && iniciarConversa(novaNumero, novaNumero)}
                  />
                  <button
                    onClick={() => novaNumero.trim() && iniciarConversa(novaNumero, novaNumero)}
                    className="px-3 py-2 bg-[#C79A54] hover:bg-[#C79A54] rounded-lg text-sm font-medium transition cursor-pointer"
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
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
                      <div className="w-9 h-9 rounded-full bg-[#C79A54]/20 text-[#E0B36A] flex items-center justify-center text-sm font-semibold shrink-0 uppercase">
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
                <div className={`w-10 h-10 rounded-full ${corAvatar(c.nome ?? c.phone ?? '?')} flex items-center justify-center shrink-0 text-sm font-semibold uppercase select-none overflow-hidden`}>
                  {c.foto_url
                    ? <img src={c.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : (c.nome ?? c.phone ?? '?')[0]
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
        <main className={`${view === 'list' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col overflow-hidden min-h-0`}>

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
                  className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                </button>
                <div className={`w-9 h-9 rounded-full ${corAvatar(selectedContato.nome ?? selectedContato.phone ?? '?')} flex items-center justify-center text-sm font-semibold uppercase select-none overflow-hidden`}>
                  {selectedContato.foto_url
                    ? <img src={selectedContato.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : (selectedContato.nome ?? selectedContato.phone ?? '?')[0]
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
                <button
                  onClick={() => pedirConfirm(
                    'Apagar esta conversa? Isso remove o histórico e o contato do WhatsApp. O cadastro do cliente não é afetado.',
                    async () => {
                      await fetch(`/api/whatsapp/apagar-conversa?contatoId=${selectedContato.id}`, { method: 'DELETE' })
                      setContatos(cs => cs.filter(c => c.id !== selectedContato.id))
                      setSelectedId(null)
                      setMensagens([])
                    },
                    { titulo: 'Apagar conversa', confirmar: 'Apagar', perigo: true },
                  )}
                  title="Apagar conversa"
                  className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
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
                  const raw = (m.raw ?? (m as unknown as Record<string, unknown>).raw) as Record<string, unknown> | null | undefined
                  const imageUrl = (raw?.image as Record<string, unknown> | undefined)?.imageUrl as string | undefined
                  const audioUrl = (raw?.audio as Record<string, unknown> | undefined)?.audioUrl as string | undefined
                  const videoUrl = (raw?.video as Record<string, unknown> | undefined)?.videoUrl as string | undefined
                  const stickerUrl = (raw?.sticker as Record<string, unknown> | undefined)?.stickerUrl as string | undefined
                  const docObj = raw?.document as Record<string, unknown> | undefined
                  const docUrl = docObj?.url as string | undefined
                  const docName = (docObj?.fileName as string | undefined) || (m.conteudo ?? 'Documento')

                  /* Reação (emoji): mostra como notinha central, não como balão */
                  if (m.tipo === 'reacao') {
                    return (
                      <div key={m.id} className="flex justify-center py-0.5">
                        <span className="text-xs text-zinc-400 bg-zinc-800/60 rounded-full px-3 py-1">
                          {enviada ? 'Você' : (selectedContato?.nome ?? 'Cliente')} {m.conteudo}
                        </span>
                      </div>
                    )
                  }

                  /* Mensagem citada (o cliente respondeu a uma mensagem específica) */
                  const ctxId = (raw?.context as Record<string, unknown> | undefined)?.id as string | undefined
                  const citada = ctxId ? msgPorId.get(ctxId) : undefined

                  const placeholders = ['📷 Imagem', '🎵 Áudio', '🎥 Vídeo', '🎯 Figurinha', '📄 Documento']
                  const mostrarTexto = !!m.conteudo && !placeholders.includes(m.conteudo) && m.tipo !== 'documento'

                  /* Menu de ação (Responder / Reagir) — só em mensagens já enviadas de verdade */
                  const acao = m.message_id ? (
                    <div className="relative self-center shrink-0">
                      <button onClick={() => setAcaoMsgId(id => id === m.id ? null : m.id)}
                        className="opacity-40 md:opacity-0 md:group-hover:opacity-100 text-zinc-500 hover:text-white w-6 h-6 flex items-center justify-center rounded-full hover:bg-zinc-800 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                      </button>
                      {acaoMsgId === m.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setAcaoMsgId(null)} />
                          <div className={`absolute z-50 top-7 ${enviada ? 'left-0' : 'right-0'} bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1.5 w-max`}>
                            <div className="flex gap-0.5 mb-1">
                              {REACOES.map(e => (
                                <button key={e} onClick={() => reagir(m, e)} className="text-lg p-1 rounded-lg hover:bg-zinc-800 transition">{e}</button>
                              ))}
                            </div>
                            <button onClick={() => { setReplyTo(m); setAcaoMsgId(null); inputRef.current?.focus() }}
                              className="w-full flex items-center gap-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 rounded-lg px-2 py-1.5 transition">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                              Responder
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null

                  return (
                    <div key={m.id} className={`group flex items-center gap-1 ${enviada ? 'justify-end' : 'justify-start'}`}>
                      {enviada && acao}
                      <div className={`max-w-[78%] rounded-2xl overflow-hidden text-sm ${
                        enviada ? 'bg-[#C79A54] text-[#16151A] rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`}>
                        {/* Prévia da mensagem citada */}
                        {citada && (
                          <div className={`mx-1.5 mt-1.5 px-2 py-1 rounded-lg border-l-2 ${enviada ? 'border-[#F0CC88]/70 bg-black/15' : 'border-[#C79A54] bg-black/25'}`}>
                            <span className="block text-[11px] font-semibold text-[#E0B36A]">
                              {citada.direcao === 'enviada' ? 'Você' : (selectedContato?.nome ?? 'Cliente')}
                            </span>
                            <span className="block text-[11px] opacity-80 line-clamp-2 break-words">{resumoMsg(citada)}</span>
                          </div>
                        )}

                        {/* Imagem */}
                        {m.tipo === 'imagem' && imageUrl && (
                          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                            <img src={imageUrl} alt="imagem" className="max-w-full max-h-64 object-cover" />
                          </a>
                        )}
                        {/* Figurinha */}
                        {m.tipo === 'sticker' && stickerUrl && (
                          <img src={stickerUrl} alt="figurinha" className="w-32 h-32 object-contain p-2" />
                        )}
                        {/* Vídeo */}
                        {m.tipo === 'video' && videoUrl && (
                          <video controls src={videoUrl} className="max-w-full max-h-64" />
                        )}
                        {/* Áudio */}
                        {m.tipo === 'audio' && audioUrl && (
                          <div className="px-3 pt-2">
                            <audio controls src={audioUrl} className="w-full h-8" />
                          </div>
                        )}
                        {/* Documento */}
                        {m.tipo === 'documento' && (
                          docUrl ? (
                            <a href={docUrl} target="_blank" rel="noopener noreferrer" download={docName}
                              className={`flex items-center gap-2 px-3 py-2.5 ${enviada ? 'hover:bg-[#C79A54]' : 'hover:bg-zinc-700'} transition`}>
                              <span className="text-xl shrink-0">📄</span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{docName}</span>
                                <span className="block text-[10px] opacity-70">Toque pra abrir</span>
                              </span>
                            </a>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2.5 opacity-70">
                              <span className="text-xl">📄</span>
                              <span className="truncate">{docName} <span className="text-[10px]">(indisponível)</span></span>
                            </div>
                          )
                        )}

                        {/* Texto / legenda */}
                        <div className="px-3 py-2">
                          {mostrarTexto && (
                            <p className="whitespace-pre-wrap break-words leading-snug">{m.conteudo}</p>
                          )}
                          <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${enviada ? 'text-[#E0B36A]' : 'text-zinc-500'}`}>
                            {fmtTime(m.timestamp)}
                            {enviada && (
                              <span className={m.status === 'lida' ? 'text-blue-300' : ''}>
                                {m.status === 'lida' ? '✓✓' : m.status === 'entregue' ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {!enviada && acao}
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
              {replyTo && (
                <div className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-l-2 border-[#C79A54] rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#E0B36A]">
                      Respondendo {replyTo.direcao === 'enviada' ? 'você mesmo' : (selectedContato?.nome ?? 'cliente')}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">{resumoMsg(replyTo)}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} title="Cancelar" className="text-zinc-500 hover:text-white shrink-0 text-lg leading-none">✕</button>
                </div>
              )}
              <div className="shrink-0 p-3 border-t border-zinc-800 flex gap-2 relative">
                {/* Paleta de emoji */}
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                    <div className="absolute bottom-full left-2 mb-2 z-50 w-64 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 grid grid-cols-8 gap-0.5">
                      {EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => { setInput(t => t + e); inputRef.current?.focus() }}
                          className="text-xl leading-none p-1 rounded-lg hover:bg-zinc-800 transition"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSendImage(f); e.target.value = '' }}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSendVideo(f); e.target.value = '' }}
                />
                <input
                  ref={docInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSendDocument(f); e.target.value = '' }}
                />
                <button
                  onClick={() => setShowEmoji(v => !v)}
                  title="Emoji"
                  className={`hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2.5 transition-colors shrink-0 ${showEmoji ? 'text-[#C79A54]' : 'text-zinc-400'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                {/* Anexo (clipe) — menu com foto de produto, imagem, vídeo, documento */}
                <div className="relative shrink-0">
                  {showAnexo && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowAnexo(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-1.5">
                        <button onClick={() => { setShowAnexo(false); abrirPickerFotos() }} className="w-full flex items-center gap-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 rounded-lg px-3 py-2 transition">🏷️ Foto de produto</button>
                        <button onClick={() => { setShowAnexo(false); imgInputRef.current?.click() }} className="w-full flex items-center gap-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 rounded-lg px-3 py-2 transition">🖼️ Imagem</button>
                        <button onClick={() => { setShowAnexo(false); videoInputRef.current?.click() }} className="w-full flex items-center gap-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 rounded-lg px-3 py-2 transition">🎥 Vídeo <span className="text-[10px] text-zinc-500">16MB</span></button>
                        <button onClick={() => { setShowAnexo(false); docInputRef.current?.click() }} className="w-full flex items-center gap-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 rounded-lg px-3 py-2 transition">📄 Documento</button>
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => setShowAnexo(v => !v)}
                    disabled={enviandoFoto || enviandoVideo || enviandoDoc || sending}
                    title="Anexar"
                    className={`hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${showAnexo ? 'text-[#C79A54]' : 'text-zinc-400'}`}
                  >
                    {(enviandoFoto || enviandoVideo || enviandoDoc) ? (
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    )}
                  </button>
                </div>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] transition-colors [color-scheme:dark]"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed text-[#16151A] rounded-xl px-3.5 py-2.5 transition-colors shrink-0"
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

      {/* Seletor de produtos do estoque (com foto) */}
      {showFotoPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowFotoPicker(false)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg h-[85vh] sm:h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">Enviar foto de produto</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Busque por marca/tamanho (ex.: &ldquo;polo M aramis&rdquo;). As já enviadas pro cliente ficam marcadas.</p>
              </div>
              <button onClick={() => setShowFotoPicker(false)} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-3 shrink-0">
              <input
                autoFocus
                value={fotoBusca}
                onChange={e => setFotoBusca(e.target.value)}
                placeholder="Ex: polo M aramis"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {fotoLoading ? (
                <p className="text-sm text-zinc-500 text-center py-8">Carregando...</p>
              ) : fotoItens.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">Nenhum produto com foto encontrado.{fotoBusca ? '' : ' Cadastre fotos na biblioteca.'}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {fotoItens.map(it => {
                    const sel = fotoSel.has(it.estoque_id)
                    return (
                      <button
                        key={it.estoque_id}
                        onClick={() => setFotoSel(prev => { const s = new Set(prev); s.has(it.estoque_id) ? s.delete(it.estoque_id) : s.add(it.estoque_id); return s })}
                        className={`relative text-left rounded-xl overflow-hidden border transition ${sel ? 'border-[#C79A54] ring-2 ring-[#C79A54]/40' : 'border-zinc-800 hover:border-zinc-600'}`}
                      >
                        <div className="aspect-square bg-zinc-800 relative">
                          <img src={it.foto_url} alt="" className={`w-full h-full object-cover ${it.ja_enviada ? 'opacity-40' : ''}`} />
                          {it.ja_enviada && (
                            <span className="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] font-semibold text-emerald-300 text-center py-0.5">já enviada ✓</span>
                          )}
                        </div>
                        {sel && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#C79A54] flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
                          </div>
                        )}
                        {it.serve && (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/90 text-white">serve</span>
                        )}
                        <div className="p-2">
                          <p className="text-xs font-medium truncate">{it.nome}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {[it.marca, it.cor].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-[10px] text-zinc-600 truncate mt-0.5">Tam: {it.tamanhos.join('/')}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setShowFotoPicker(false); imgInputRef.current?.click() }}
                className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-2.5 transition cursor-pointer shrink-0"
              >
                📁 Do computador
              </button>
              <button
                onClick={enviarFotosSelecionadas}
                disabled={fotoSel.size === 0}
                className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                Enviar {fotoSel.size > 0 ? `${fotoSel.size} foto${fotoSel.size > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
