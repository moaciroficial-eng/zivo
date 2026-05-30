'use client'

import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Quais clientes têm aniversário este mês?',
  'Qual é a receita total dos últimos 30 dias?',
  'Quais produtos estão com estoque baixo?',
  'Quais eventos estão agendados esta semana?',
]

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isOpen = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function openPanel() {
    const panel = panelRef.current
    if (!panel) return
    panel.style.display = 'flex'
    isOpen.current = true
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function closePanel() {
    const panel = panelRef.current
    if (!panel) return
    panel.style.display = 'none'
    isOpen.current = false
  }

  function togglePanel() {
    if (isOpen.current) closePanel()
    else openPanel()
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Erro na resposta')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantContent += decoder.decode(value, { stream: true })
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantContent },
        ])
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Painel — sempre no DOM, visibilidade via style.display direto (iOS safe) */}
      <div
        ref={panelRef}
        style={{ display: 'none' }}
        className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 h-[520px] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/60 flex-col z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Assistente Zivo</p>
              <p className="text-xs text-zinc-500 leading-tight">Pergunte sobre sua loja</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded-md hover:bg-zinc-800 transition"
              >
                Limpar
              </button>
            )}
            <button
              onClick={closePanel}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition"
              aria-label="Fechar chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="3" fill="#8b5cf6"/>
                </svg>
              </div>
              <p className="text-zinc-400 text-sm text-center leading-relaxed px-2">
                Olá! Tenho acesso completo à sua loja — clientes, vendas, estoque e calendário.
              </p>
              <div className="w-full space-y-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-xl px-3 py-2.5 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content || (
                    <span className="flex items-center gap-1 py-0.5">
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]"/>
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]"/>
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]"/>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div className="p-3 border-t border-zinc-800 shrink-0">
          <div className="flex items-end gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pergunte sobre sua loja…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 outline-none resize-none [color-scheme:dark] max-h-28 disabled:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
              aria-label="Enviar"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
              </svg>
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-1.5 text-center">Enter para enviar · Shift+Enter para nova linha</p>
        </div>
      </div>

      {/* FAB — visibilidade do ícone via DOM ref também */}
      <button
        onClick={togglePanel}
        className="fixed bottom-4 right-4 sm:right-6 w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 hover:opacity-90 transition z-50 cursor-pointer"
        aria-label="Abrir chat"
      >
        <svg id="chat-icon-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </>
  )
}
