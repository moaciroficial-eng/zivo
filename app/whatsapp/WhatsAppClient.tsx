'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/app/components/useConfirm'
import { clienteServeProduto } from '@/lib/tamanhos'
import type { ProdutoResolvido } from '@/lib/ofertas'

type Contato = {
  id: string
  phone: string
  jid: string | null
  nome: string | null
  foto_url: string | null
  ultima_mensagem: string | null
  ultima_mensagem_at: string | null
  nao_lidas: number
  cliente_id?: string | null
}

type ClienteMini = {
  id: string
  nome: string
  telefone: string | null
  tamanho_camiseta: string | null
  tamanho_calca: string | null
  tamanho_tenis: string | null
}

/* Resumo curto dos tamanhos do cadastro -- "Cam M · Cal 40" */
function resumoTamanhosCliente(cli?: ClienteMini | null): string {
  if (!cli) return ''
  const partes: string[] = []
  if (cli.tamanho_camiseta) partes.push(`Cam ${cli.tamanho_camiseta}`)
  if (cli.tamanho_calca) partes.push(`Cal ${cli.tamanho_calca}`)
  if (cli.tamanho_tenis) partes.push(`Tên ${cli.tamanho_tenis}`)
  return partes.join(' · ')
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
  preco_promocional: number | null
  foto_url: string
  tamanhos: string[]
  serve: boolean
  ja_enviada?: boolean
}

/* Preço final de uma foto: desconto manual escolhido agora > preço
   promocional já cadastrado no produto > preço de venda normal. */
function precoFinalFoto(it: ProdutoFoto, descontoPct: number): number | null {
  if (descontoPct > 0 && descontoPct < 100 && it.preco_venda) return it.preco_venda * (1 - descontoPct / 100)
  if (it.preco_promocional != null) return it.preco_promocional
  return it.preco_venda
}

type PecaOferta = {
  estoque_id: string
  nome: string
  marca: string | null
  foto_url: string
  tamanhos: string[]
  preco_de: number | null
  preco_por: number | null
}

type ItemQuadro = PecaOferta & {
  tamanhosDisponiveis: string[]
  esgotado: boolean
  removido: boolean
}

/* Uma foto de produto encontrada no histórico da conversa (últimos 30 dias) --
   "encontrado: false" quando não deu pra casar com nenhum item do estoque. */
type HistoricoItem = {
  foto_url: string
  timestamp: string
  encontrado: boolean
  estoque_id?: string
  nome?: string
  marca?: string | null
  tamanhos?: string[]
  preco_de?: number | null
  preco_por?: number | null
  caption?: string | null
}

function fmtPrecoBRL(n: number): string {
  return `R$${n.toFixed(2).replace('.', ',')}`
}

/* Legenda padrão sugerida pra uma foto -- ponto de partida editável, não o
   texto final (o dono revisa/ajusta cada uma antes de enviar). Mostra o
   preço "de/por" quando há desconto, mas nunca o % -- só o valor em R$. */
function construirLegendaFoto(it: ProdutoFoto, descontoPct: number): string {
  const base = [it.nome, it.marca].filter(Boolean).join(' ')
  if (!it.preco_venda) return base
  const final = precoFinalFoto(it, descontoPct)
  if (final != null && final < it.preco_venda) {
    return `${base} — de ${fmtPrecoBRL(it.preco_venda)} por ${fmtPrecoBRL(final)}`
  }
  return `${base} — ${fmtPrecoBRL(it.preco_venda)}`
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
  const [fotoSel, setFotoSel] = useState<Map<string, ProdutoFoto>>(new Map())  // guarda o produto inteiro p/ persistir entre buscas
  const [fotoProgresso, setFotoProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [fotoLoading, setFotoLoading] = useState(false)
  const [fotoStep, setFotoStep] = useState<'selecionar' | 'revisar'>('selecionar')
  const [fotoLegendas, setFotoLegendas] = useState<Record<string, string>>({})   // texto editável por produto, antes de enviar
  const [fotoDescontos, setFotoDescontos] = useState<Record<string, string>>({})   // % por produto (ex.: Black Friday) -- só pra montar o "de/por", nunca mostrado
  const [lidPhone, setLidPhone] = useState<Record<string, string>>({})
  // Quadro de "Copiar oferta" -- peças de uma oferta anterior, com estoque rechecado
  const [quadroAberto, setQuadroAberto] = useState(false)
  const [quadroLoading, setQuadroLoading] = useState(false)
  const [quadroOrigemId, setQuadroOrigemId] = useState<string | null>(null)
  const [quadroItens, setQuadroItens] = useState<ItemQuadro[]>([])
  const [quadroTrocaTamanho, setQuadroTrocaTamanho] = useState('')
  // Picker de fotos antigas enviadas na conversa (não rastreadas como oferta)
  const [showHistoricoPicker, setShowHistoricoPicker] = useState(false)
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [historicoItens, setHistoricoItens] = useState<HistoricoItem[]>([])
  const [historicoSel, setHistoricoSel] = useState<Set<number>>(new Set())
  // Escolher contatos pra encaminhar a oferta copiada
  const [showEscolherContatos, setShowEscolherContatos] = useState(false)
  const [contatosBuscaEnc, setContatosBuscaEnc] = useState('')
  const [contatosSelecionados, setContatosSelecionados] = useState<Map<string, Contato>>(new Map())
  const [resumoEncaminhar, setResumoEncaminhar] = useState<{ dentro: { id: string; nome: string | null }[]; fora: { id: string; nome: string | null }[] } | null>(null)
  const [templatesAprovados, setTemplatesAprovados] = useState<{ name: string; bodyText?: string }[]>([])
  const [templateEscolhido, setTemplateEscolhido] = useState('')
  const [encaminhando, setEncaminhando] = useState(false)
  const [resultadoEncaminhar, setResultadoEncaminhar] = useState<string | null>(null)
  // Oferta esperando o dono mandar as fotos na mão (cliente já respondeu o template)
  const [ofertaPendente, setOfertaPendente] = useState<{ id: string; pecas: PecaOferta[] } | null>(null)
  const [enviandoPendente, setEnviandoPendente] = useState(false)
  // Depois de enviar com desconto manual, pergunta se salva o preço no produto
  const [promptSalvarPreco, setPromptSalvarPreco] = useState<{ estoque_id: string; nome: string; precoFinal: number }[] | null>(null)
  const [salvandoPreco, setSalvandoPreco] = useState(false)
  const [search, setSearch] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [replyTo, setReplyTo] = useState<Mensagem | null>(null)   // mensagem que estou citando
  const [acaoMsgId, setAcaoMsgId] = useState<string | null>(null) // menu de ação aberto
  const [view, setView] = useState<'list' | 'chat'>('list')
  /* Conexão/QR removidos — Meta oficial não usa QR nem "instância". */
  const [novaConversa, setNovaConversa] = useState(false)
  const [novaSearch, setNovaSearch] = useState('')
  const [novaNumero, setNovaNumero] = useState('')
  const [clientes, setClientes] = useState<ClienteMini[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [confirmUI, pedirConfirm] = useConfirm()
  // Editar nome do contato / vincular a um cliente cadastrado
  const [showEditarContato, setShowEditarContato] = useState(false)
  const [editarNomeInput, setEditarNomeInput] = useState('')
  const [editarClienteBusca, setEditarClienteBusca] = useState('')
  const [salvandoContato, setSalvandoContato] = useState(false)
  // Contatos dentro da janela de 24h -- calculado quando abre "Escolher contatos"
  const [janelaAbertaIds, setJanelaAbertaIds] = useState<Set<string> | null>(null)
  // Produto por trás de uma foto citada no quadrinho "respondendo a ..." (cache por mensagem)
  const [produtoCitado, setProdutoCitado] = useState<Map<string, ProdutoResolvido>>(new Map())
  const produtoFetchedRef = useRef<Set<string>>(new Set())
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const selectedContato = contatos.find(c => c.id === selectedId) ?? null
  const clientesPorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])

  /* Nome pra exibir: cadastro do cliente > nome do WhatsApp > telefone */
  function nomeExibicao(c: Contato): string {
    const cli = c.cliente_id ? clientesPorId.get(c.cliente_id) : undefined
    return cli?.nome ?? c.nome ?? fmtPhone(c.phone) ?? c.phone
  }

  /* Telefone formatado com o final em destaque -- pra diferenciar vários
     contatos com o mesmo nome (ex.: três "Alessandro") de cara. */
  function fmtPhoneDestaque(phone: string): { prefixo: string; fim: string } | null {
    const f = fmtPhone(phone)
    if (!f || f.length < 4) return null
    return { prefixo: f.slice(0, -4), fim: f.slice(-4) }
  }

  /* Tamanhos que a oferta no quadro cobre agora (peças ainda não removidas) --
     usado pra avisar quando o tamanho do cadastro do cliente não bate. */
  const tamanhosOferta = [...new Set(quadroItens.filter(it => !it.removido).flatMap(it => it.tamanhos))]

  function avisoTamanhoCliente(cli?: ClienteMini | null): string | null {
    if (!cli || tamanhosOferta.length === 0) return null
    const tamsCliente = [cli.tamanho_camiseta, cli.tamanho_calca, cli.tamanho_tenis].filter((t): t is string => !!t)
    if (tamsCliente.length === 0) return null
    if (clienteServeProduto(tamsCliente, tamanhosOferta)) return null
    return `usa ${tamsCliente.join('/')}, oferta é ${tamanhosOferta.join('/')}`
  }

  /* Mapa message_id → mensagem, pra achar a mensagem citada numa resposta */
  const msgPorId = new Map<string, Mensagem>()
  for (const mm of mensagens) if (mm.message_id) msgPorId.set(mm.message_id, mm)

  /* Clica no quadrinho "respondendo a ..." -> rola até a mensagem original e destaca por 2s */
  function irParaMensagem(id: string) {
    msgRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightMsgId(id)
    setTimeout(() => setHighlightMsgId(h => (h === id ? null : h)), 2000)
  }

  /* Identifica o produto por trás de cada foto citada (pra nome/tamanho/preço +
     "Registrar venda dessa peça"). Dedup por ref -- não refaz a mesma busca
     a cada render ou quando mensagens novas chegam por realtime. */
  useEffect(() => {
    for (const mm of mensagens) {
      const ctxId = (mm.raw?.context as Record<string, unknown> | undefined)?.id as string | undefined
      if (!ctxId) continue
      const citada = msgPorId.get(ctxId)
      if (!citada || citada.tipo !== 'imagem' || produtoFetchedRef.current.has(citada.id)) continue
      produtoFetchedRef.current.add(citada.id)
      fetch(`/api/whatsapp/mensagens/produto?mensagemId=${citada.id}`)
        .then(r => r.json())
        .then((data: ProdutoResolvido & { ok?: boolean }) =>
          setProdutoCitado(prev => new Map(prev).set(citada.id, data?.ok ? data : { encontrado: false })))
        .catch(() => setProdutoCitado(prev => new Map(prev).set(citada.id, { encontrado: false })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens])

  /* Deep-link: /whatsapp?contato=<id> (vindo de "Clientes para responder" no dashboard) abre a conversa direto */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('contato')
    if (id) setSelectedId(id)
  }, [])

  /* ── Nova conversa ── */
  function abrirNovaConversa() {
    setNovaConversa(true)
    setNovaSearch('')
    setNovaNumero('')
  }

  /* Carrega os clientes cadastrados uma vez -- usado pra mostrar o nome do
     cadastro na lista/cabeçalho, pro seletor de "Nova conversa" e pra
     vincular um contato do WhatsApp a um cadastro. */
  useEffect(() => {
    supabase.from('clientes')
      .select('id, nome, telefone, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .order('nome')
      .then(({ data }) => setClientes((data ?? []) as ClienteMini[]))
  }, [user.id])

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

  /* Oferta esperando o dono mandar as fotos na mão pra esse contato */
  useEffect(() => {
    setOfertaPendente(null)
    if (!selectedId) return
    fetch(`/api/whatsapp/ofertas/pendente?contatoId=${selectedId}`)
      .then(r => r.json())
      .then(d => { if (d?.ok && d.oferta) setOfertaPendente({ id: d.oferta.id, pecas: d.oferta.pecas ?? [] }) })
      .catch(() => null)
  }, [selectedId])

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

  /* Envia uma imagem já hospedada (URL) — usado pelo upload e pelo seletor de estoque.
     ofertaId (opcional) marca a mensagem como parte de uma oferta, pra poder
     agrupar e mostrar o botão "Copiar oferta" na conversa depois. */
  async function enviarImagemUrl(imageUrl: string, caption?: string, ofertaId?: string): Promise<boolean> {
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
      raw: { image: { imageUrl, caption: caption ?? null, ofertaId: ofertaId ?? null } },
    } as unknown as Mensagem
    setMensagens(prev => [...prev, msgOtimista])
    try {
      const res = await fetch('/api/whatsapp/send-imagem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: override ?? selectedContato.phone, imageUrl, caption, contatoId: selectedContato.id, ofertaId }),
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

  /* "Copiar oferta" -- sobe as peças de uma oferta anterior pro quadro,
     já rechecando estoque (esgotado sai sozinho, aviso quando o tamanho
     que tinha acabou mas tem outro). */
  async function abrirQuadro(ofertaId: string) {
    setQuadroAberto(true)
    setQuadroLoading(true)
    setQuadroItens([])
    setQuadroOrigemId(null)
    setQuadroTrocaTamanho('')
    try {
      const res = await fetch(`/api/whatsapp/ofertas/${ofertaId}`)
      const d = await res.json().catch(() => null)
      if (!d?.ok) {
        setSendError(d?.erro || 'Falha ao copiar a oferta')
        setTimeout(() => setSendError(null), 6000)
        setQuadroAberto(false)
        return
      }
      setQuadroOrigemId(d.ofertaId)
      setQuadroItens((d.itens as ItemQuadro[]).map(it => ({ ...it, removido: it.esgotado })))
    } catch {
      setSendError('Falha ao copiar a oferta')
      setTimeout(() => setSendError(null), 6000)
      setQuadroAberto(false)
    } finally {
      setQuadroLoading(false)
    }
  }

  function removerDoQuadro(estoqueId: string) {
    setQuadroItens(prev => prev.map(it => it.estoque_id === estoqueId ? { ...it, removido: true } : it))
  }

  function restaurarNoQuadro(estoqueId: string) {
    setQuadroItens(prev => prev.map(it => it.estoque_id === estoqueId && !it.esgotado ? { ...it, removido: false } : it))
  }

  function definirPrecoQuadro(estoqueId: string, precoPor: string) {
    const n = Number(precoPor.replace(',', '.'))
    setQuadroItens(prev => prev.map(it => it.estoque_id === estoqueId ? { ...it, preco_por: Number.isFinite(n) ? n : it.preco_por } : it))
  }

  /* Troca o tamanho desejado de todas as peças ainda no quadro pro mesmo
     tamanho (ex.: copiou pro Licinho em M, agora quer mandar tudo em P) --
     o aviso de "acabou, tem X" já recalcula sozinho a partir disso. */
  function trocarTamanhoTudo(tam: string) {
    setQuadroTrocaTamanho(tam)
    setQuadroItens(prev => prev.map(it => it.removido ? it : { ...it, tamanhos: [tam] }))
  }

  /* "Copiar oferta" a partir de qualquer foto de produto enviada antes nessa
     conversa (não só ofertas rastreadas) -- abre a lista dos últimos 30 dias. */
  async function abrirHistoricoPicker() {
    if (!selectedContato) return
    setShowHistoricoPicker(true)
    setHistoricoLoading(true)
    setHistoricoItens([])
    setHistoricoSel(new Set())
    try {
      const res = await fetch(`/api/whatsapp/ofertas/historico?contatoId=${selectedContato.id}`)
      const d = await res.json().catch(() => null)
      const itens: HistoricoItem[] = d?.ok ? d.itens : []
      setHistoricoItens(itens)
      setHistoricoSel(new Set(itens.flatMap((it, i) => it.encontrado ? [i] : [])))
    } catch {
      setHistoricoItens([])
    } finally {
      setHistoricoLoading(false)
    }
  }

  function toggleHistoricoSel(i: number) {
    setHistoricoSel(prev => {
      const s = new Set(prev)
      if (s.has(i)) s.delete(i); else s.add(i)
      return s
    })
  }

  /* Sobe as fotos marcadas pro quadro de "Copiar oferta" já existente --
     mesma recheagem de estoque, só que a partir de peças soltas do histórico
     em vez de uma única oferta salva. Produtos repetidos (mesma peça mandada
     em dias diferentes) entram uma só vez, com o envio mais recente. */
  async function continuarComHistorico() {
    const selecionadas = historicoItens.filter((it, i) => it.encontrado && historicoSel.has(i))
    if (selecionadas.length === 0) return
    const vistos = new Set<string>()
    const pecas: PecaOferta[] = []
    for (const it of selecionadas) {
      if (!it.estoque_id || vistos.has(it.estoque_id)) continue
      vistos.add(it.estoque_id)
      pecas.push({
        estoque_id: it.estoque_id, nome: it.nome ?? '', marca: it.marca ?? null, foto_url: it.foto_url,
        tamanhos: it.tamanhos ?? [], preco_de: it.preco_de ?? null, preco_por: it.preco_por ?? null,
      })
    }
    setShowHistoricoPicker(false)
    setQuadroAberto(true)
    setQuadroLoading(true)
    setQuadroItens([])
    setQuadroOrigemId(null)
    setQuadroTrocaTamanho('')
    try {
      const res = await fetch('/api/whatsapp/ofertas/recheck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecas }),
      })
      const d = await res.json().catch(() => null)
      if (!d?.ok) {
        setSendError(d?.erro || 'Falha ao copiar as ofertas.')
        setTimeout(() => setSendError(null), 6000)
        setQuadroAberto(false)
        return
      }
      setQuadroItens((d.itens as ItemQuadro[]).map(it => ({ ...it, removido: it.esgotado })))
    } catch {
      setSendError('Falha ao copiar as ofertas.')
      setTimeout(() => setSendError(null), 6000)
      setQuadroAberto(false)
    } finally {
      setQuadroLoading(false)
    }
  }

  /* Edita o nome do contato no WhatsApp e/ou vincula a um cliente cadastrado --
     resolve o "três Alessandro" mostrando de quem é cada conversa de verdade. */
  function abrirEditarContato() {
    if (!selectedContato) return
    setEditarNomeInput(selectedContato.nome ?? '')
    setEditarClienteBusca('')
    setShowEditarContato(true)
  }

  async function salvarNomeContato() {
    if (!selectedContato) return
    setSalvandoContato(true)
    try {
      const nome = editarNomeInput.trim() || null
      await supabase.from('whatsapp_contatos').update({ nome }).eq('id', selectedContato.id)
      setContatos(cs => cs.map(c => c.id === selectedContato.id ? { ...c, nome } : c))
    } finally {
      setSalvandoContato(false)
    }
  }

  async function vincularCliente(clienteId: string | null) {
    if (!selectedContato) return
    setSalvandoContato(true)
    try {
      await supabase.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', selectedContato.id)
      setContatos(cs => cs.map(c => c.id === selectedContato.id ? { ...c, cliente_id: clienteId } : c))
      setShowEditarContato(false)
    } finally {
      setSalvandoContato(false)
    }
  }

  async function abrirEscolherContatos() {
    setContatosSelecionados(new Map())
    setContatosBuscaEnc('')
    setResumoEncaminhar(null)
    setTemplateEscolhido('')
    setResultadoEncaminhar(null)
    setJanelaAbertaIds(null)
    setShowEscolherContatos(true)
    try {
      const res = await fetch('/api/whatsapp/ofertas/encaminhar/janela', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoIds: contatos.map(c => c.id) }),
      })
      const d = await res.json().catch(() => null)
      setJanelaAbertaIds(new Set(d?.ok ? d.abertos : []))
    } catch {
      setJanelaAbertaIds(new Set())
    }
  }

  function toggleContatoSelecionado(c: Contato) {
    setContatosSelecionados(prev => {
      const s = new Map(prev)
      if (s.has(c.id)) s.delete(c.id); else s.set(c.id, c)
      return s
    })
  }

  /* Busca por nome (cadastro ou WhatsApp), telefone ou tamanho do cadastro --
     pra achar "o Alessandro que usa M" mesmo com vários contatos homônimos. */
  function contatoCombinaBusca(c: Contato, termoBruto: string): boolean {
    const termo = termoBruto.toLowerCase().trim()
    if (!termo) return true
    const cli = c.cliente_id ? clientesPorId.get(c.cliente_id) : undefined
    const nomes = [cli?.nome, c.nome].filter(Boolean).join(' ').toLowerCase()
    if (nomes.includes(termo)) return true
    if (c.phone.includes(termo)) return true
    const tamanhos = [cli?.tamanho_camiseta, cli?.tamanho_calca, cli?.tamanho_tenis].filter(Boolean).join(' ').toLowerCase()
    return tamanhos.includes(termo)
  }

  /* Checa a janela de 24h de cada contato escolhido e, se algum estiver fora,
     carrega os templates aprovados pro dono escolher qual mandar primeiro. */
  async function prepararResumoEncaminhar() {
    const ids = [...contatosSelecionados.keys()]
    if (ids.length === 0) return
    try {
      const res = await fetch('/api/whatsapp/ofertas/encaminhar/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoIds: ids }),
      })
      const d = await res.json()
      if (!d.ok) { setResultadoEncaminhar(d.erro || 'Falha ao preparar o envio.'); return }
      setResumoEncaminhar({ dentro: d.dentro, fora: d.fora })
      if (d.fora.length > 0 && templatesAprovados.length === 0) {
        const rt = await fetch('/api/whatsapp/templates').then(r => r.json()).catch(() => null)
        if (rt?.ok) setTemplatesAprovados((rt.templates ?? []).filter((t: { status?: string }) => t.status === 'APPROVED'))
      }
    } catch {
      setResultadoEncaminhar('Falha ao preparar o envio.')
    }
  }

  async function confirmarEncaminhar() {
    if (!resumoEncaminhar) return
    if (resumoEncaminhar.fora.length > 0 && !templateEscolhido) {
      setResultadoEncaminhar('Escolha um template pra quem está fora da janela de 24h.')
      return
    }
    setEncaminhando(true)
    setResultadoEncaminhar(null)
    try {
      const pecas: PecaOferta[] = quadroItens.filter(it => !it.removido)
        .map(({ removido, tamanhosDisponiveis, esgotado, ...p }) => p)
      const res = await fetch('/api/whatsapp/ofertas/encaminhar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origemOfertaId: quadroOrigemId, pecas,
          contatoIds: [...resumoEncaminhar.dentro, ...resumoEncaminhar.fora].map(c => c.id),
          templateName: templateEscolhido || undefined,
        }),
      })
      const d = await res.json()
      if (!d.ok) { setResultadoEncaminhar('Falha ao encaminhar a oferta.'); return }
      const falhas = (d.resultados ?? []).filter((r: { ok: boolean }) => !r.ok).length
      setResultadoEncaminhar(falhas > 0 ? `Encaminhado — ${falhas} falharam.` : 'Oferta encaminhada!')
      setTimeout(() => { setShowEscolherContatos(false); setQuadroAberto(false) }, 1500)
    } catch {
      setResultadoEncaminhar('Falha ao encaminhar a oferta.')
    } finally {
      setEncaminhando(false)
    }
  }

  async function enviarOfertaPendente() {
    if (!ofertaPendente) return
    setEnviandoPendente(true)
    try {
      await fetch(`/api/whatsapp/ofertas/${ofertaPendente.id}/enviar-pendente`, { method: 'POST' })
      setOfertaPendente(null)
    } catch {
      setSendError('Falha ao enviar a oferta.')
      setTimeout(() => setSendError(null), 6000)
    } finally {
      setEnviandoPendente(false)
    }
  }

  async function salvarPrecoNoProduto() {
    if (!promptSalvarPreco) return
    setSalvandoPreco(true)
    try {
      await Promise.all(promptSalvarPreco.map(it =>
        supabase.from('estoque').update({ preco_promocional: it.precoFinal }).eq('id', it.estoque_id)
      ))
    } finally {
      setSalvandoPreco(false)
      setPromptSalvarPreco(null)
    }
  }

  /* ── Seletor de produtos do estoque (com foto) ── */
  async function abrirPickerFotos() {
    setShowFotoPicker(true)
    setFotoStep('selecionar')
    setFotoSel(new Map())
    setFotoDescontos({})
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

  /* Monta a legenda sugerida de cada selecionado e abre a tela de revisão
     -- nada é enviado ainda, o dono edita cada texto antes de confirmar. */
  function abrirRevisao() {
    const legendas: Record<string, string> = {}
    for (const it of fotoSel.values()) legendas[it.estoque_id] = construirLegendaFoto(it, Number(fotoDescontos[it.estoque_id]) || 0)
    setFotoLegendas(legendas)
    setFotoStep('revisar')
  }

  /* Troca o desconto de um produto específico e regera a legenda sugerida
     dele (se o dono já tiver editado o texto na mão, essa troca substitui --
     é o ajuste fino: escolheu %, achou ruim, troca ou edita o texto direto). */
  function definirDescontoItem(it: ProdutoFoto, pct: string) {
    setFotoDescontos(prev => ({ ...prev, [it.estoque_id]: pct }))
    setFotoLegendas(prev => ({ ...prev, [it.estoque_id]: construirLegendaFoto(it, Number(pct) || 0) }))
  }

  async function enviarFotosSelecionadas() {
    const escolhidas = [...fotoSel.values()]   // todos os selecionados (mesmo de buscas anteriores)
    if (escolhidas.length === 0 || !selectedContato) return
    setEnviandoFoto(true)
    setShowFotoPicker(false)
    setFotoStep('selecionar')

    // Registra a oferta ANTES de enviar, pra marcar cada foto com o id dela
    // (permite agrupar na conversa e oferecer "Copiar oferta" depois).
    const pecas: PecaOferta[] = escolhidas.map(it => {
      const pct = Number(fotoDescontos[it.estoque_id]) || 0
      return {
        estoque_id: it.estoque_id, nome: it.nome, marca: it.marca, foto_url: it.foto_url,
        tamanhos: it.tamanhos, preco_de: it.preco_venda, preco_por: precoFinalFoto(it, pct),
      }
    })
    // Desconto manual escolhido agora (não vem do preço promocional já cadastrado) --
    // depois de enviar, pergunta se quer salvar esse preço no produto.
    const comDescontoManual = escolhidas.filter(it => {
      const pct = Number(fotoDescontos[it.estoque_id]) || 0
      return pct > 0 && pct < 100 && precoFinalFoto(it, pct) !== it.preco_promocional
    })
    let ofertaId: string | undefined
    try {
      const r = await fetch('/api/whatsapp/ofertas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoId: selectedContato.id, pecas }),
      })
      const d = await r.json().catch(() => null)
      ofertaId = d?.ofertaId
    } catch { /* histórico é secundário, não bloqueia o envio */ }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const total = escolhidas.length
    let ok = 0
    for (let i = 0; i < total; i++) {
      const it = escolhidas[i]
      setFotoProgresso({ feitas: i, total })
      const pct = Number(fotoDescontos[it.estoque_id]) || 0
      const legenda = (fotoLegendas[it.estoque_id] ?? '').trim() || construirLegendaFoto(it, pct)
      let enviado = await enviarImagemUrl(it.foto_url, legenda, ofertaId)
      if (!enviado) { await sleep(1200); enviado = await enviarImagemUrl(it.foto_url, legenda, ofertaId) }  // 1 retry
      if (enviado) ok++
      if (i < total - 1) await sleep(700)   // espaça pra não tomar throttle da Meta
    }
    setFotoProgresso(null)
    setEnviandoFoto(false)
    setFotoSel(new Map())
    setFotoLegendas({})
    if (comDescontoManual.length > 0) {
      setPromptSalvarPreco(comDescontoManual.map(it => ({
        estoque_id: it.estoque_id, nome: it.nome,
        precoFinal: precoFinalFoto(it, Number(fotoDescontos[it.estoque_id]) || 0)!,
      })))
    }
    if (ok < total) {
      setSendError(`Enviei ${ok} de ${total} fotos — a Meta limita rajada. Reenvie as que faltaram.`)
      setTimeout(() => setSendError(null), 9000)
    }
  }

  function openContato(id: string) {
    setSelectedId(id)
    setView('chat')
  }

  const filtered = contatos.filter(c =>
    nomeExibicao(c).toLowerCase().includes(search.toLowerCase()) ||
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
            <Link
              href="/whatsapp/templates"
              title="Templates de mensagem"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 hover:border-[#C79A54]/60 transition shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>
            </Link>
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
                <div className={`w-10 h-10 rounded-full ${corAvatar(nomeExibicao(c))} flex items-center justify-center shrink-0 text-sm font-semibold uppercase select-none overflow-hidden`}>
                  {c.foto_url
                    ? <img src={c.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : nomeExibicao(c)[0]
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-medium truncate">{nomeExibicao(c)}</span>
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
                <div className={`w-9 h-9 rounded-full ${corAvatar(nomeExibicao(selectedContato))} flex items-center justify-center text-sm font-semibold uppercase select-none overflow-hidden`}>
                  {selectedContato.foto_url
                    ? <img src={selectedContato.foto_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : nomeExibicao(selectedContato)[0]
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold leading-tight truncate">{nomeExibicao(selectedContato)}</p>
                    <button
                      onClick={abrirEditarContato}
                      title="Editar nome / vincular cliente"
                      className="text-zinc-500 hover:text-[#E0B36A] transition shrink-0 cursor-pointer"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                  </div>
                  {(phoneFromJid(selectedContato.jid) ?? fmtPhone(selectedContato.phone)) && (
                    <p className="text-[11px] text-zinc-500">
                      {phoneFromJid(selectedContato.jid) ?? fmtPhone(selectedContato.phone)}
                    </p>
                  )}
                  {selectedContato.cliente_id ? (
                    <p className="text-[11px] text-emerald-400">
                      {resumoTamanhosCliente(clientesPorId.get(selectedContato.cliente_id)) || 'Cadastro vinculado'}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-500">sem cadastro</p>
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
                  onClick={abrirHistoricoPicker}
                  title="Copiar oferta enviada antes"
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-[#E0B36A] transition-colors shrink-0"
                >
                  <span className="text-base leading-none">🔁</span>
                </button>
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
                {mensagens.map((m, idx) => {
                  const enviada = m.direcao === 'enviada'
                  const raw = (m.raw ?? (m as unknown as Record<string, unknown>).raw) as Record<string, unknown> | null | undefined
                  const imageUrl = (raw?.image as Record<string, unknown> | undefined)?.imageUrl as string | undefined

                  // Primeira foto de uma oferta (sequência de fotos com o mesmo
                  // ofertaId) -- mostra "Copiar oferta" em cima do grupo.
                  const ofertaIdMsg = (raw?.image as Record<string, unknown> | undefined)?.ofertaId as string | undefined
                  const prevMsg = idx > 0 ? mensagens[idx - 1] : null
                  const prevRaw = prevMsg ? ((prevMsg.raw ?? (prevMsg as unknown as Record<string, unknown>).raw) as Record<string, unknown> | null | undefined) : null
                  const prevOfertaId = (prevRaw?.image as Record<string, unknown> | undefined)?.ofertaId as string | undefined
                  const mostrarCopiarOferta = m.tipo === 'imagem' && enviada && !!ofertaIdMsg && ofertaIdMsg !== prevOfertaId
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

                  const citadaImageUrl = citada ? ((citada.raw?.image as Record<string, unknown> | undefined)?.imageUrl as string | undefined) : undefined
                  const produtoDaCitada = citada ? produtoCitado.get(citada.id) : undefined

                  return (
                    <div key={m.id} ref={el => { if (el) msgRefs.current.set(m.id, el); else msgRefs.current.delete(m.id) }}
                      className={`rounded-xl transition-colors duration-500 ${highlightMsgId === m.id ? 'bg-[#C79A54]/20' : ''}`}>
                      {mostrarCopiarOferta && (
                        <div className="flex justify-end mb-1">
                          <button
                            onClick={() => abrirQuadro(ofertaIdMsg!)}
                            className="text-xs text-[#E0B36A] bg-[#C79A54]/15 hover:bg-[#C79A54]/25 border border-[#C79A54]/30 rounded-lg px-2.5 py-1 transition"
                          >
                            🔁 Copiar oferta
                          </button>
                        </div>
                      )}
                      <div className={`group flex items-center gap-1 ${enviada ? 'justify-end' : 'justify-start'}`}>
                      {enviada && acao}
                      <div className={`max-w-[78%] rounded-2xl overflow-hidden text-sm ${
                        enviada ? 'bg-[#C79A54] text-[#16151A] rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`}>
                        {/* Prévia da mensagem citada -- clica e rola até a original */}
                        {citada && (
                          <button type="button" onClick={() => irParaMensagem(citada.id)}
                            className={`block w-full text-left mx-1.5 mt-1.5 px-2 py-1 rounded-lg border-l-2 ${enviada ? 'border-[#F0CC88]/70 bg-black/15 hover:bg-black/25' : 'border-[#C79A54] bg-black/25 hover:bg-black/35'} transition`}>
                            <span className="flex items-start gap-2">
                              {citadaImageUrl && (
                                <img src={citadaImageUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                              )}
                              <span className="min-w-0">
                                <span className="block text-[11px] font-semibold text-[#E0B36A]">
                                  {citada.direcao === 'enviada' ? 'Você' : (selectedContato?.nome ?? 'Cliente')}
                                </span>
                                <span className="block text-[11px] opacity-80 line-clamp-2 break-words">{resumoMsg(citada)}</span>
                              </span>
                            </span>
                          </button>
                        )}

                        {/* Peça de estoque por trás da foto citada */}
                        {citada && produtoDaCitada?.encontrado && (
                          <div className="mx-1.5 mb-1.5 px-2 py-1.5 rounded-lg bg-black/20 text-[11px] space-y-1">
                            <p className="opacity-90">
                              {[produtoDaCitada.nome, produtoDaCitada.marca].filter(Boolean).join(' ')}
                              {produtoDaCitada.tamanhos?.length ? ` · ${produtoDaCitada.tamanhos.join('/')}` : ''}
                              {produtoDaCitada.preco_por != null ? ` · R$${produtoDaCitada.preco_por.toFixed(2).replace('.', ',')}` : ''}
                            </p>
                            <Link
                              href={`/vendas?nova=1&estoqueId=${encodeURIComponent(produtoDaCitada.estoque_id ?? '')}&nome=${encodeURIComponent([produtoDaCitada.nome, produtoDaCitada.marca].filter(Boolean).join(' '))}&tamanho=${produtoDaCitada.tamanhos?.length === 1 ? encodeURIComponent(produtoDaCitada.tamanhos[0]) : ''}&preco=${produtoDaCitada.preco_por ?? ''}&clienteId=${encodeURIComponent(selectedContato?.cliente_id ?? '')}`}
                              target="_blank"
                              className={`inline-block font-semibold rounded-lg px-2 py-1 transition ${enviada ? 'bg-[#16151A]/20 hover:bg-[#16151A]/30' : 'bg-[#C79A54] text-[#16151A] hover:bg-[#d8ac68]'}`}
                            >
                              Registrar venda dessa peça
                            </Link>
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
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input de envio */}
              {ofertaPendente && (
                <div className="mx-3 mb-1 flex items-center justify-between gap-2 px-3 py-2 bg-[#C79A54]/10 border border-[#C79A54]/30 rounded-lg">
                  <span className="text-xs text-[#E0B36A]">📦 Oferta esperando resposta — {ofertaPendente.pecas.length} peça{ofertaPendente.pecas.length > 1 ? 's' : ''} pronta{ofertaPendente.pecas.length > 1 ? 's' : ''}</span>
                  <button
                    onClick={enviarOfertaPendente}
                    disabled={enviandoPendente}
                    className="text-xs font-semibold text-[#16151A] bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 rounded-lg px-3 py-1.5 transition cursor-pointer shrink-0"
                  >
                    {enviandoPendente ? 'Enviando…' : 'Enviar agora'}
                  </button>
                </div>
              )}
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowFotoPicker(false); setFotoStep('selecionar') }}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg h-[85vh] sm:h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">{fotoStep === 'revisar' ? 'Revisar antes de enviar' : 'Enviar foto de produto'}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {fotoStep === 'revisar'
                    ? 'Edite o texto de cada foto como quiser — nada foi enviado ainda.'
                    : 'Busque por marca/tamanho (ex.: "polo M aramis"). As já enviadas pro cliente ficam marcadas.'}
                </p>
              </div>
              <button onClick={() => { setShowFotoPicker(false); setFotoStep('selecionar') }} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {fotoStep === 'selecionar' ? (
              <>
                <div className="p-3 shrink-0 flex flex-col gap-2">
                  <input
                    autoFocus
                    value={fotoBusca}
                    onChange={e => setFotoBusca(e.target.value)}
                    placeholder="Ex: polo M aramis"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
                  />
                  <p className="text-[11px] text-zinc-600">Selecione as fotos e clique em Revisar — o desconto de cada produto você ajusta na tela seguinte.</p>
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
                            onClick={() => setFotoSel(prev => { const s = new Map(prev); if (s.has(it.estoque_id)) s.delete(it.estoque_id); else s.set(it.estoque_id, it); return s })}
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
                    onClick={abrirRevisao}
                    disabled={fotoSel.size === 0}
                    className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                  >
                    Revisar {fotoSel.size > 0 ? `${fotoSel.size} foto${fotoSel.size > 1 ? 's' : ''}` : ''}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-3 pt-3 pb-3 flex flex-col gap-3">
                  {[...fotoSel.values()].map(it => (
                    <div key={it.estoque_id} className="flex gap-3 bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3">
                      <img src={it.foto_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 bg-zinc-800" />
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <p className="text-xs text-zinc-500 truncate">
                          {it.nome}{it.marca ? ` · ${it.marca}` : ''}{it.preco_venda ? ` · ${fmtPrecoBRL(it.preco_venda)}` : ''}
                        </p>
                        {it.preco_promocional != null && !fotoDescontos[it.estoque_id] && (
                          <p className="text-[11px] text-emerald-400">🏷️ Promoção ativa: por {fmtPrecoBRL(it.preco_promocional)}</p>
                        )}
                        {it.preco_venda != null && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {[10, 20, 30, 40, 50, 60, 70].map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => definirDescontoItem(it, fotoDescontos[it.estoque_id] === String(p) ? '' : String(p))}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${fotoDescontos[it.estoque_id] === String(p) ? 'bg-[#C79A54] text-zinc-950 border-[#C79A54]' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
                              >
                                {p}%
                              </button>
                            ))}
                            <input
                              value={fotoDescontos[it.estoque_id] ?? ''}
                              onChange={e => definirDescontoItem(it, e.target.value.replace(/\D/g, '').slice(0, 2))}
                              placeholder="outro"
                              className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] text-center placeholder-zinc-600 outline-none focus:border-[#C79A54] [color-scheme:dark]"
                            />
                            {fotoDescontos[it.estoque_id] && (
                              <button type="button" onClick={() => definirDescontoItem(it, '')} className="text-[11px] text-zinc-500 hover:text-red-400 transition px-1 cursor-pointer">limpar</button>
                            )}
                          </div>
                        )}
                        <textarea
                          value={fotoLegendas[it.estoque_id] ?? ''}
                          onChange={e => setFotoLegendas(prev => ({ ...prev, [it.estoque_id]: e.target.value }))}
                          rows={2}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 resize-y outline-none focus:border-[#C79A54] [color-scheme:dark]"
                        />
                      </div>
                      <button
                        type="button"
                        title="Remover desta leva"
                        onClick={() => setFotoSel(prev => { const s = new Map(prev); s.delete(it.estoque_id); return s })}
                        className="text-zinc-500 hover:text-red-400 transition shrink-0 self-start"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                  {fotoSel.size === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-8">Nenhuma foto selecionada.</p>
                  )}
                </div>

                <div className="p-3 border-t border-zinc-800 flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setFotoStep('selecionar')}
                    className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-2.5 transition cursor-pointer shrink-0"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={enviarFotosSelecionadas}
                    disabled={fotoSel.size === 0}
                    className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                  >
                    Enviar {fotoSel.size > 0 ? `${fotoSel.size} foto${fotoSel.size > 1 ? 's' : ''}` : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Picker de fotos de produto enviadas antes nessa conversa (últimos 30
          dias) -- junta peças de várias mensagens antigas pro quadro de
          "Copiar oferta" existente, mesmo sem uma oferta rastreada por trás. */}
      {showHistoricoPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowHistoricoPicker(false)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg h-[85vh] sm:h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">Copiar oferta</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Fotos enviadas nos últimos 30 dias — desmarque o que não quer levar.</p>
              </div>
              <button onClick={() => setShowHistoricoPicker(false)} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {historicoLoading && <p className="text-sm text-zinc-500 text-center py-8">Carregando…</p>}
              {!historicoLoading && historicoItens.map((it, i) => (
                <label key={i} className={`flex gap-2.5 p-2.5 rounded-xl border bg-zinc-800/60 ${it.encontrado ? 'border-zinc-700/60 cursor-pointer' : 'border-zinc-800 opacity-50 cursor-not-allowed'}`}>
                  <input
                    type="checkbox"
                    checked={it.encontrado && historicoSel.has(i)}
                    disabled={!it.encontrado}
                    onChange={() => toggleHistoricoSel(i)}
                    className="accent-[#C79A54] mt-1 shrink-0"
                  />
                  <img src={it.foto_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 bg-zinc-800" />
                  <div className="flex-1 min-w-0">
                    {it.encontrado ? (
                      <>
                        <p className="text-sm font-medium truncate">{[it.nome, it.marca].filter(Boolean).join(' ')}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Tamanhos: {(it.tamanhos ?? []).join(', ') || '—'}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs">
                          {it.preco_de != null && it.preco_de !== it.preco_por && (
                            <span className="text-zinc-500 line-through">{fmtPrecoBRL(it.preco_de)}</span>
                          )}
                          {it.preco_por != null && <span className="text-[#E0B36A] font-medium">{fmtPrecoBRL(it.preco_por)}</span>}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-zinc-400 truncate">{it.caption || 'Foto sem legenda'}</p>
                        <p className="text-[11px] text-red-400 mt-0.5">Não encontrado no estoque</p>
                      </>
                    )}
                  </div>
                </label>
              ))}
              {!historicoLoading && historicoItens.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-8">Nenhuma foto de produto enviada nos últimos 30 dias.</p>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 shrink-0">
              <button
                onClick={continuarComHistorico}
                disabled={historicoSel.size === 0}
                className="w-full text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                Copiar {historicoSel.size > 0 ? `${historicoSel.size} peça${historicoSel.size > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quadro de "Copiar oferta" -- peças da oferta anterior, estoque rechecado */}
      {quadroAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setQuadroAberto(false)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg h-[85vh] sm:h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">Copiar oferta</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Estoque rechecado agora — ajuste e escolha pra quem encaminhar.</p>
              </div>
              <button onClick={() => setQuadroAberto(false)} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {!quadroLoading && quadroItens.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap px-3 pt-3 shrink-0">
                <span className="text-[11px] text-zinc-500 shrink-0">Trocar tamanho de tudo:</span>
                {['P', 'M', 'G', 'GG', 'XGG'].map(tam => (
                  <button
                    key={tam}
                    type="button"
                    onClick={() => trocarTamanhoTudo(tam)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${quadroTrocaTamanho === tam ? 'bg-[#C79A54] text-zinc-950 border-[#C79A54]' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
                  >
                    {tam}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {quadroLoading && <p className="text-sm text-zinc-500 text-center py-8">Carregando…</p>}
              {!quadroLoading && quadroItens.map(it => {
                const faltantes = it.tamanhos.filter(t => !it.tamanhosDisponiveis.includes(t))
                const avisoTamanho = !it.esgotado && faltantes.length > 0 && it.tamanhosDisponiveis.length > 0
                return (
                  <div key={it.estoque_id} className={`flex gap-2.5 p-2.5 rounded-xl border ${it.removido ? 'border-zinc-800 opacity-50' : 'border-zinc-700/60'} bg-zinc-800/60`}>
                    <img src={it.foto_url} alt={it.nome} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{[it.nome, it.marca].filter(Boolean).join(' ')}</p>
                      {it.esgotado ? (
                        <p className="text-[11px] text-red-400 mt-0.5">Esgotado — saiu da oferta</p>
                      ) : avisoTamanho ? (
                        <p className="text-[11px] text-amber-400 mt-0.5">{faltantes.join(', ')} acabou, tem {it.tamanhosDisponiveis.join(', ')}</p>
                      ) : (
                        <p className="text-[11px] text-zinc-500 mt-0.5">Tamanhos: {it.tamanhosDisponiveis.join(', ')}</p>
                      )}
                      {!it.esgotado && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                          {it.preco_de != null && it.preco_de !== it.preco_por && (
                            <span className="text-zinc-500 line-through">{fmtPrecoBRL(it.preco_de)}</span>
                          )}
                          <span className="text-zinc-400">R$</span>
                          <input
                            value={it.preco_por != null ? it.preco_por.toFixed(2).replace('.', ',') : ''}
                            onChange={e => definirPrecoQuadro(it.estoque_id, e.target.value)}
                            className="w-20 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs outline-none focus:border-[#C79A54] [color-scheme:dark]"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      title={it.removido ? 'Incluir de novo' : 'Remover'}
                      disabled={it.esgotado}
                      onClick={() => it.removido ? restaurarNoQuadro(it.estoque_id) : removerDoQuadro(it.estoque_id)}
                      className="text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0 self-start"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )
              })}
              {!quadroLoading && quadroItens.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-8">Nenhuma peça nessa oferta.</p>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 shrink-0">
              <button
                onClick={abrirEscolherContatos}
                disabled={quadroItens.every(it => it.removido)}
                className="w-full text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
              >
                Escolher contatos →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escolher contatos pra encaminhar a oferta copiada */}
      {showEscolherContatos && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowEscolherContatos(false)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg h-[85vh] sm:h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">{resumoEncaminhar ? 'Confirmar encaminhamento' : 'Escolher contatos'}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {resumoEncaminhar
                    ? `${quadroItens.filter(it => !it.removido).length} peças pra ${resumoEncaminhar.dentro.length + resumoEncaminhar.fora.length} clientes`
                    : 'Busque por nome e marque um ou vários clientes.'}
                </p>
              </div>
              <button onClick={() => setShowEscolherContatos(false)} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {!resumoEncaminhar ? (
              <>
                <div className="p-3 shrink-0">
                  <input
                    autoFocus
                    value={contatosBuscaEnc}
                    onChange={e => setContatosBuscaEnc(e.target.value)}
                    placeholder="Buscar por nome, telefone ou tamanho…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-1">
                  {contatos
                    .filter(c => contatoCombinaBusca(c, contatosBuscaEnc))
                    .map(c => {
                      const cli = c.cliente_id ? clientesPorId.get(c.cliente_id) : undefined
                      const tel = fmtPhoneDestaque(c.phone)
                      const tamanhos = resumoTamanhosCliente(cli)
                      const aviso = avisoTamanhoCliente(cli)
                      const dentro = janelaAbertaIds?.has(c.id)
                      return (
                        <label key={c.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-zinc-800/60 cursor-pointer">
                          <input type="checkbox" checked={contatosSelecionados.has(c.id)} onChange={() => toggleContatoSelecionado(c)} className="accent-[#C79A54] mt-1" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm truncate">{cli?.nome ?? c.nome ?? c.phone}</span>
                              {janelaAbertaIds && (
                                <span className={`text-[10px] font-medium shrink-0 ${dentro ? 'text-emerald-400' : 'text-amber-500'}`}>
                                  {dentro ? 'janela aberta' : 'fora da janela (vai template)'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 truncate">
                              {tel ? <>{tel.prefixo}<span className="text-zinc-300 font-medium">{tel.fim}</span></> : c.phone}
                              {tamanhos && ` · ${tamanhos}`}
                              {!cli && <span className="text-amber-500"> · sem cadastro</span>}
                            </p>
                            {aviso && <p className="text-[11px] text-amber-500 mt-0.5">⚠️ {aviso}</p>}
                          </div>
                        </label>
                      )
                    })}
                </div>
                <div className="p-3 border-t border-zinc-800 shrink-0">
                  <button
                    onClick={prepararResumoEncaminhar}
                    disabled={contatosSelecionados.size === 0}
                    className="w-full text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                  >
                    Ver resumo ({contatosSelecionados.size})
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                  <div className="text-sm text-zinc-300">
                    <p>✅ {resumoEncaminhar.dentro.length} dentro da janela de 24h — recebem as fotos direto.</p>
                    {resumoEncaminhar.fora.length > 0 && (
                      <p className="mt-1">⏳ {resumoEncaminhar.fora.length} fora da janela — recebem um template primeiro.</p>
                    )}
                  </div>
                  {quadroItens.filter(it => !it.removido).length > 10 && (
                    <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                      ⚠️ {quadroItens.filter(it => !it.removido).length} peças por cliente — considere reduzir pra não sobrecarregar a conversa.
                    </p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {[...resumoEncaminhar.dentro.map(c => ({ ...c, dentro: true })), ...resumoEncaminhar.fora.map(c => ({ ...c, dentro: false }))].map(r => {
                      const contato = contatos.find(x => x.id === r.id)
                      const cli = contato?.cliente_id ? clientesPorId.get(contato.cliente_id) : undefined
                      const tel = contato ? fmtPhoneDestaque(contato.phone) : null
                      const tamanhos = resumoTamanhosCliente(cli)
                      const aviso = avisoTamanhoCliente(cli)
                      return (
                        <div key={r.id} className="flex items-start justify-between gap-2 bg-zinc-800/60 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{cli?.nome ?? r.nome ?? 'Contato'}</p>
                            <p className="text-[11px] text-zinc-500 truncate">
                              {tel ? <>{tel.prefixo}<span className="text-zinc-300 font-medium">{tel.fim}</span></> : ''}
                              {tamanhos && ` · ${tamanhos}`}
                            </p>
                            {aviso && <p className="text-[11px] text-amber-500 mt-0.5">⚠️ {aviso}</p>}
                          </div>
                          <span className={`text-[10px] font-medium shrink-0 ${r.dentro ? 'text-emerald-400' : 'text-amber-500'}`}>
                            {r.dentro ? 'direto' : 'template'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {resumoEncaminhar.fora.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Template pra quem está fora da janela:</p>
                      <select
                        value={templateEscolhido}
                        onChange={e => setTemplateEscolhido(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C79A54] [color-scheme:dark]"
                      >
                        <option value="">Selecione um template…</option>
                        {templatesAprovados.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  {resultadoEncaminhar && <p className="text-sm text-[#E0B36A]">{resultadoEncaminhar}</p>}
                </div>
                <div className="p-3 border-t border-zinc-800 flex items-center gap-2 shrink-0">
                  <button onClick={() => setResumoEncaminhar(null)} className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-2.5 transition cursor-pointer shrink-0">
                    ← Voltar
                  </button>
                  <button
                    onClick={confirmarEncaminhar}
                    disabled={encaminhando}
                    className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                  >
                    {encaminhando ? 'Enviando…' : 'Confirmar envio'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Editar nome do contato / vincular a um cliente cadastrado */}
      {showEditarContato && selectedContato && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowEditarContato(false)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-sm max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold">Editar contato</h3>
              <button onClick={() => setShowEditarContato(false)} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Nome no WhatsApp</p>
                <div className="flex gap-2">
                  <input
                    value={editarNomeInput}
                    onChange={e => setEditarNomeInput(e.target.value)}
                    placeholder={selectedContato.phone}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark]"
                  />
                  <button
                    onClick={salvarNomeContato}
                    disabled={salvandoContato}
                    className="text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 rounded-xl px-3 transition cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-1.5">
                  {selectedContato.cliente_id ? 'Vinculado a:' : 'Vincular a um cliente cadastrado'}
                </p>
                {selectedContato.cliente_id && (
                  <div className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{clientesPorId.get(selectedContato.cliente_id)?.nome}</p>
                      <p className="text-[11px] text-zinc-500">{resumoTamanhosCliente(clientesPorId.get(selectedContato.cliente_id))}</p>
                    </div>
                    <button onClick={() => vincularCliente(null)} disabled={salvandoContato} className="text-xs text-red-400 hover:text-red-300 transition cursor-pointer shrink-0 ml-2">
                      Desvincular
                    </button>
                  </div>
                )}
                <input
                  value={editarClienteBusca}
                  onChange={e => setEditarClienteBusca(e.target.value)}
                  placeholder="Buscar cliente pelo nome ou telefone…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:border-[#C79A54] [color-scheme:dark] mb-2"
                />
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {clientes
                    .filter(c => editarClienteBusca.trim() && (
                      c.nome.toLowerCase().includes(editarClienteBusca.toLowerCase()) ||
                      (c.telefone ?? '').includes(editarClienteBusca)
                    ))
                    .slice(0, 20)
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => vincularCliente(c.id)}
                        disabled={salvandoContato}
                        className="w-full flex items-center justify-between text-left bg-zinc-800/40 hover:bg-zinc-800 rounded-lg px-3 py-2 transition cursor-pointer disabled:opacity-40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">{c.nome}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{c.telefone ?? ''}{resumoTamanhosCliente(c) && ` · ${resumoTamanhosCliente(c)}`}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "Salvar esse preço no produto?" -- depois de um desconto manual na revisão */}
      {promptSalvarPreco && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPromptSalvarPreco(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Salvar esse preço no produto?</h3>
            <p className="text-xs text-zinc-500 mb-3">Assim ele já vem pronto na próxima vez — sem precisar escolher o desconto de novo.</p>
            <div className="flex flex-col gap-1 mb-4 max-h-40 overflow-y-auto">
              {promptSalvarPreco.map(it => (
                <div key={it.estoque_id} className="flex items-center justify-between text-sm text-zinc-300">
                  <span className="truncate">{it.nome}</span>
                  <span className="text-[#E0B36A] font-medium shrink-0 ml-2">{fmtPrecoBRL(it.precoFinal)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPromptSalvarPreco(null)} className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg py-2.5 transition cursor-pointer">
                Não
              </button>
              <button onClick={salvarPrecoNoProduto} disabled={salvandoPreco} className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#C79A54] disabled:opacity-40 rounded-lg py-2.5 transition cursor-pointer">
                {salvandoPreco ? 'Salvando…' : 'Sim, salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progresso do envio em lote de fotos */}
      {fotoProgresso && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#141317] border border-[#C79A54]/40 rounded-full px-4 py-2 shadow-2xl flex items-center gap-2.5">
          <span className="w-4 h-4 border-2 border-[#C79A54] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#F4EFE7]">Enviando fotos… {fotoProgresso.feitas}/{fotoProgresso.total}</span>
        </div>
      )}

    </div>
  )
}
