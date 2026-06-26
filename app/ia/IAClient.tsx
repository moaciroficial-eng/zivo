'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/* ── Types ──────────────────────────────────────────────────── */
type Message = { role: 'user' | 'assistant'; content: string }

type Sugestao = {
  id: string; tipo: string; titulo: string; descricao: string
  prioridade: number; status: string
  acao: { tipo: string; clientes?: string[]; sugestao_mensagem?: string } | null
  created_at: string
}
type Agente = { id: string; tipo: string; nome: string; ativo: boolean; ultima_execucao: string | null; total_execucoes: number }
type Log = { id: string; acao: string; created_at: string; contato_id: string | null; resultado: Record<string, unknown> | null; agentes: { nome: string; tipo: string } | null }

/* ── Config visual ──────────────────────────────────────────── */
const TIPO_SUGESTAO: Record<string, { emoji: string; cor: string }> = {
  vip:          { emoji: '👑', cor: 'border-yellow-500/40 bg-yellow-500/5' },
  brinde:       { emoji: '🎁', cor: 'border-yellow-500/40 bg-yellow-500/5' },
  reativacao:   { emoji: '🔥', cor: 'border-red-500/40 bg-red-500/5' },
  campanha:     { emoji: '🎯', cor: 'border-[#3B6FFF]/40 bg-[#3B6FFF]/5' },
  cross_sell:   { emoji: '🔗', cor: 'border-purple-500/40 bg-purple-500/5' },
  tendencia:    { emoji: '📈', cor: 'border-[#00D4AA]/40 bg-[#00D4AA]/5' },
  oportunidade: { emoji: '💡', cor: 'border-zinc-500/40 bg-zinc-800/40' },
}

const SUGGESTIONS_CHAT = [
  'Quem não compra há mais de 30 dias?',
  'Qual foi o faturamento esse mês?',
  'Quais produtos estão encalhados?',
  'Quem são os clientes VIP?',
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* ════════════════════════════════════════════════════════════ */
export default function IAClient({ sugestoes: initialSugestoes, agentes, logs }: {
  sugestoes: Sugestao[]; agentes: Agente[]; logs: Log[]
}) {
  const [tab, setTab] = useState<'socio' | 'acoes' | 'gerente' | 'aprendizado'>('socio')
  const [sugestoes, setSugestoes] = useState(initialSugestoes)
  const router = useRouter()

  /* ── Sócio (chat) ──────────────────────────────────────── */
  const [msgs, setMsgs] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function sendSocio(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const newMsgs: Message[] = [...msgs, { role: 'user', content }]
    setMsgs(newMsgs)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs }),
      })
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      setMsgs(prev => [...prev, { role: 'assistant', content: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMsgs(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantText }
          return updated
        })
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── Sugestões ─────────────────────────────────────────── */
  async function resolverSugestao(id: string, status: 'resolvida' | 'ignorada') {
    await fetch('/api/inteligencia/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setSugestoes(s => s.filter(x => x.id !== id))
  }

  const [rodando, setRodando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  async function rodarInteligencia() {
    setRodando(true)
    try {
      const res = await fetch('/api/inteligencia/analisar', { method: 'POST' })
      const data = await res.json()
      if (data.ok) window.location.reload()
    } finally {
      setRodando(false)
    }
  }

  /* ── Gerente ───────────────────────────────────────────── */
  const [gerenteMsgs, setGerenteMsgs] = useState<Array<{ papel: string; conteudo: string; tarefa?: Record<string, unknown> | null }>>([])
  const [gerenteInput, setGerenteInput] = useState('')
  const [gerentePensando, setGerentePensando] = useState(false)
  const [tarefaPendente, setTarefaPendente] = useState<Record<string, unknown> | null>(null)
  const [previewContatos, setPreviewContatos] = useState<{ id: string; nome: string }[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const gerenteBottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { gerenteBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [gerenteMsgs])

  async function enviarGerente() {
    if (!gerenteInput.trim() || gerentePensando) return
    const texto = gerenteInput.trim()
    setGerenteInput('')
    setGerenteMsgs(prev => [...prev, { papel: 'supervisor', conteudo: texto }])
    setGerentePensando(true)
    try {
      const res = await fetch('/api/gerente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: texto, historico: gerenteMsgs }),
      })
      const data = await res.json()
      setGerenteMsgs(prev => [...prev, { papel: 'gerente', conteudo: data.resposta, tarefa: data.tarefa }])
      if (data.tarefa) { setTarefaPendente(data.tarefa); setPreviewContatos(data.previewContatos ?? []) }
    } finally { setGerentePensando(false) }
  }

  async function confirmarTarefa() {
    if (!tarefaPendente) return
    setConfirmando(true)
    try {
      const res = await fetch('/api/gerente', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarefa: tarefaPendente }),
      })
      const data = await res.json()
      setGerenteMsgs(prev => [...prev, { papel: 'gerente', conteudo: `✅ Tarefa iniciada! Enviando mensagens para ${data.total} contatos.` }])
      setTarefaPendente(null)
      router.refresh()
    } finally { setConfirmando(false) }
  }

  /* ── Aprendizado ───────────────────────────────────────── */
  const [aprendMsgs, setAprendMsgs] = useState<Array<{ papel: string; conteudo: string }>>([])
  const [aprendInput, setAprendInput] = useState('')
  const [aprendPensando, setAprendPensando] = useState(false)
  const [aprendSalvando, setAprendSalvando] = useState(false)
  const [aprendResumo, setAprendResumo] = useState<string | null>(null)
  const aprendBottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { aprendBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aprendMsgs])

  async function enviarAprendizado() {
    if (!aprendInput.trim() || aprendPensando) return
    const texto = aprendInput.trim()
    setAprendInput('')
    const novoHistorico = [...aprendMsgs, { papel: 'dono', conteudo: texto }]
    setAprendMsgs(novoHistorico)
    setAprendPensando(true)
    try {
      const res = await fetch('/api/aprendizado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: texto, historico: aprendMsgs }),
      })
      const data = await res.json()
      if (data.resposta) setAprendMsgs([...novoHistorico, { papel: 'zivo', conteudo: data.resposta }])
    } finally { setAprendPensando(false) }
  }

  /* ── Automações status ─────────────────────────────────── */
  const agenteMap = Object.fromEntries(agentes.map(a => [a.tipo, a]))

  /* ── Render ────────────────────────────────────────────── */
  const tabCls = (t: typeof tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${tab === t ? 'bg-[#3B6FFF]/15 text-[#7FA8FF] border border-[#3B6FFF]/25' : 'text-zinc-500 hover:text-zinc-300'}`

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-screen max-w-3xl mx-auto w-full px-4 py-4 gap-4">

      {/* Header + Tabs */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <h1 className="text-lg font-bold text-white">IA</h1>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          <button className={tabCls('socio')} onClick={() => setTab('socio')}>🧑‍💼 Sócio</button>
          <button className={tabCls('acoes')} onClick={() => setTab('acoes')}>
            ⚡ Ações{sugestoes.length > 0 ? ` (${sugestoes.length})` : ''}
          </button>
          <button className={tabCls('gerente')} onClick={() => setTab('gerente')}>🤖 Gerente</button>
          <button className={tabCls('aprendizado')} onClick={() => setTab('aprendizado')}>🧠</button>
        </div>
      </div>

      {/* ── Tab: Sócio ──────────────────────────────────── */}
      {tab === 'socio' && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            {msgs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">🧑‍💼</p>
                <p className="text-zinc-300 font-medium">Sócio virtual da Moca</p>
                <p className="text-zinc-500 text-sm mt-1 max-w-xs mx-auto">Pergunta qualquer coisa sobre vendas, clientes ou estoque.</p>
                <div className="flex flex-col gap-2 mt-4 max-w-xs mx-auto">
                  {SUGGESTIONS_CHAT.map(s => (
                    <button key={s} onClick={() => sendSocio(s)}
                      className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-400 px-3 py-2 rounded-lg transition cursor-pointer">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#3B6FFF] text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}>
                  {m.content || <span className="animate-pulse text-zinc-500">...</span>}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="flex gap-2 border-t border-zinc-800 pt-3 shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSocio() } }}
              placeholder="Pergunta sobre a loja..."
              rows={1}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#3B6FFF] [color-scheme:dark]"
              disabled={loading}
            />
            <button
              onClick={() => sendSocio()}
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-[#3B6FFF] hover:bg-[#5585FF] disabled:opacity-40 text-white rounded-xl text-sm font-medium transition cursor-pointer"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Ações ──────────────────────────────────── */}
      {tab === 'acoes' && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <p className="text-xs text-zinc-500">Sugestões geradas automaticamente pela IA</p>
            <button
              onClick={rodarInteligencia}
              disabled={rodando}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition cursor-pointer border border-zinc-700"
            >
              {rodando ? (
                <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Analisando...</>
              ) : (
                <>↺ Analisar agora</>
              )}
            </button>
          </div>

          {sugestoes.length === 0 ? (
            <div className="text-center py-20 text-zinc-600">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm text-zinc-400">Nenhuma ação pendente</p>
              <p className="text-xs mt-1 text-zinc-600">Clique em "Analisar agora" para gerar sugestões</p>
            </div>
          ) : (
            sugestoes.map(s => {
              const cfg = TIPO_SUGESTAO[s.tipo] ?? TIPO_SUGESTAO.oportunidade
              const aberta = expandida === s.id
              return (
                <div key={s.id} className={`border rounded-xl overflow-hidden transition-all shrink-0 ${cfg.cor}`}>
                  <button className="w-full text-left px-4 py-3.5 flex items-start gap-3" onClick={() => setExpandida(aberta ? null : s.id)}>
                    <span className="text-xl shrink-0 mt-0.5">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-zinc-100">{s.titulo}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{s.descricao}</p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 mt-1 text-zinc-500 transition-transform ${aberta ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {aberta && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                      <p className="text-sm text-zinc-300 leading-relaxed">{s.descricao}</p>
                      {s.acao?.clientes && s.acao.clientes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {s.acao.clientes.map(c => <span key={c} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{c}</span>)}
                        </div>
                      )}
                      {s.acao?.sugestao_mensagem && (
                        <p className="text-sm text-zinc-300 bg-zinc-800/60 rounded-lg px-3 py-2.5 italic border border-zinc-700/40">
                          &ldquo;{s.acao.sugestao_mensagem}&rdquo;
                        </p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => resolverSugestao(s.id, 'resolvida')}
                          className="flex-1 py-2 bg-[#00D4AA] hover:bg-[#00B894] text-[#080B10] rounded-lg text-xs font-bold transition">
                          ✓ Feito
                        </button>
                        <button onClick={() => resolverSugestao(s.id, 'ignorada')}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 transition">
                          Ignorar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Status das automações */}
          <div className="mt-2 border border-zinc-800 rounded-xl p-4 shrink-0">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Automações ativas</p>
            <div className="space-y-2">
              {[
                { key: 'dados', label: 'Agente de Dados', desc: 'Analisa conversas e atualiza perfis' },
              ].map(ag => {
                const ativo = agenteMap[ag.key]
                return (
                  <div key={ag.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-300">{ag.label}</p>
                      <p className="text-[10px] text-zinc-600">{ag.desc}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ativo ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-zinc-700 text-zinc-500'}`}>
                      {ativo ? '● ativo' : '○ inativo'}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-300">Inteligência v2</p>
                  <p className="text-[10px] text-zinc-600">Reativação, presentes, estoque — 9h diário</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00D4AA]/15 text-[#00D4AA]">● ativo</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-300">Aniversários</p>
                  <p className="text-[10px] text-zinc-600">Cupons e mensagens — 9h diário</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00D4AA]/15 text-[#00D4AA]">● ativo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Gerente ────────────────────────────────── */}
      {tab === 'gerente' && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            {gerenteMsgs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">🤖</p>
                <p className="text-zinc-300 font-medium">Gerente de tarefas</p>
                <p className="text-zinc-500 text-sm mt-1 max-w-xs mx-auto">Coordena os agentes para executar ações em massa.</p>
                <div className="flex flex-col gap-2 mt-4 max-w-xs mx-auto">
                  {[
                    'Atualiza o cadastro dos clientes — perguntar nome e tamanho',
                    'Campanha pra clientes que compraram Aramis',
                    'Manda mensagem pra todos sem cadastro completo',
                  ].map(ex => (
                    <button key={ex} onClick={() => setGerenteInput(ex)}
                      className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-400 px-3 py-2 rounded-lg transition cursor-pointer">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {gerenteMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.papel === 'supervisor' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.papel === 'supervisor'
                    ? 'bg-zinc-700 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}>
                  <p>{m.conteudo}</p>
                  {m.tarefa && tarefaPendente && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      {previewContatos.length > 0 && (
                        <div>
                          <p className="text-[11px] text-zinc-400 mb-1">{previewContatos.length} contato{previewContatos.length > 1 ? 's' : ''}:</p>
                          <div className="flex flex-wrap gap-1">
                            {previewContatos.map(c => <span key={c.id} className="text-[11px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">{c.nome}</span>)}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={confirmarTarefa} disabled={confirmando}
                          className="px-3 py-1.5 bg-[#00D4AA] hover:bg-[#00B894] disabled:opacity-50 text-[#080B10] text-xs font-bold rounded-lg transition cursor-pointer">
                          {confirmando ? 'Iniciando...' : `✓ Confirmar`}
                        </button>
                        <button onClick={() => { setTarefaPendente(null); setPreviewContatos([]) }}
                          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition cursor-pointer">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {gerentePensando && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-zinc-500">
                  <span className="animate-pulse">Pensando...</span>
                </div>
              </div>
            )}
            <div ref={gerenteBottomRef} />
          </div>
          <div className="flex gap-2 border-t border-zinc-800 pt-3 shrink-0">
            <input
              value={gerenteInput}
              onChange={e => setGerenteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enviarGerente() } }}
              placeholder="Ex: atualiza o cadastro dos clientes..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-zinc-500 transition [color-scheme:dark]"
              disabled={gerentePensando}
            />
            <button onClick={enviarGerente} disabled={!gerenteInput.trim() || gerentePensando}
              className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition cursor-pointer">
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Aprendizado ────────────────────────────── */}
      {tab === 'aprendizado' && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {!aprendResumo && aprendMsgs.length === 0 && (
            <div className="text-center py-10 px-4 shrink-0">
              <p className="text-3xl mb-3">🧠</p>
              <p className="text-zinc-300 font-semibold">Sessão de Aprendizado</p>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
                Conta o que você sabe sobre seus clientes. A IA absorve como inteligência permanente.
              </p>
              <div className="flex flex-col gap-2 mt-4 max-w-xs mx-auto">
                {[
                  'Fiz uma campanha da Aramis que funcionou muito bem...',
                  'Cliente que pede polo geralmente quer premium...',
                  'Sexta à tarde é quando mais vendo...',
                ].map(ex => (
                  <button key={ex} onClick={() => setAprendInput(ex)}
                    className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-400 px-3 py-2 rounded-lg transition cursor-pointer">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {aprendResumo && (
            <div className="rounded-xl border border-[#00D4AA]/20 bg-[#00D4AA]/5 p-4 shrink-0">
              <p className="text-[#00D4AA] font-semibold text-sm mb-1">✅ Aprendizado salvo!</p>
              <p className="text-zinc-300 text-sm leading-relaxed">{aprendResumo}</p>
              <button onClick={() => { setAprendMsgs([]); setAprendResumo(null); setAprendInput('') }}
                className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline cursor-pointer">
                Nova sessão
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 min-h-0">
            {aprendMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.papel === 'dono' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.papel === 'dono' ? 'bg-zinc-700 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}>
                  {m.conteudo}
                </div>
              </div>
            ))}
            {aprendPensando && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-zinc-500 animate-pulse">Processando...</div>
              </div>
            )}
            <div ref={aprendBottomRef} />
          </div>
          {aprendMsgs.length > 0 && !aprendResumo && (
            <button onClick={async () => {
              setAprendSalvando(true)
              try {
                const res = await fetch('/api/aprendizado', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ historico: aprendMsgs }),
                })
                const data = await res.json()
                setAprendResumo(data.resumo ? `${data.resumo}\n\n${data.salvos} insight(s) salvos.` : `${data.salvos} insight(s) salvos.`)
              } finally { setAprendSalvando(false) }
            }} disabled={aprendSalvando}
              className="text-sm bg-[#00D4AA] hover:bg-[#00B894] disabled:opacity-50 text-[#080B10] font-bold py-2.5 px-4 rounded-xl transition cursor-pointer shrink-0">
              {aprendSalvando ? 'Salvando...' : '✅ Salvar aprendizados'}
            </button>
          )}
          {!aprendResumo && (
            <div className="flex gap-2 border-t border-zinc-800 pt-3 shrink-0">
              <textarea
                value={aprendInput}
                onChange={e => setAprendInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarAprendizado() } }}
                placeholder="Conta o que você sabe, uma estratégia que funcionou..."
                rows={2}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
              />
              <button onClick={enviarAprendizado} disabled={!aprendInput.trim() || aprendPensando}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition cursor-pointer">
                Enviar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
