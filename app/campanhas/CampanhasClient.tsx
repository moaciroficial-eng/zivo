'use client'

import { useState, useRef, useEffect } from 'react'

type CampanhaRow = {
  id: string; nome: string; objetivo: string | null
  copy_whatsapp: string | null; status: string; created_at: string
}

type Proposta = {
  titulo: string
  objetivo: string
  tamanhos: string[]
  marca: string | null
  copy_descritor: string
  copy_texto: string
  produtos_destaque: string[]
  desconto: string | null
}
type Publico = { id: string; nome: string; telefone: string | null; motivo: string }
type Msg = { papel: 'dono' | 'consultora'; conteudo: string }

const SUGESTOES = [
  'Chegou um produto e quero zerar a grade dele',
  'Quero girar uma peça que tá parada no estoque',
  'Montar uma campanha pro Dia dos Pais',
  'Quero reativar clientes que sumiram',
]

export default function CampanhasClient({ campanhas }: { campanhas: CampanhaRow[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [publico, setPublico] = useState<Publico[]>([])
  const [copyEditada, setCopyEditada] = useState('')
  const [disparando, setDisparando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  async function enviar(texto?: string) {
    const conteudo = (texto ?? input).trim()
    if (!conteudo || pensando) return
    setInput(''); setErro(null); setResultado(null)
    const novos: Msg[] = [...msgs, { papel: 'dono', conteudo }]
    setMsgs(novos); setPensando(true)
    try {
      const res = await fetch('/api/campanhas/consultora', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: conteudo, historico: msgs }),
      })
      const data = await res.json()
      if (!data.ok) { setErro('A consultora tropeçou. Tenta de novo.'); return }
      setMsgs(prev => [...prev, { papel: 'consultora', conteudo: data.resposta }])
      if (data.proposta) {
        setProposta(data.proposta)
        setPublico(data.publico ?? [])
        setCopyEditada(data.proposta.copy_texto ?? '')
      }
    } catch { setErro('Erro de conexão.') } finally { setPensando(false) }
  }

  async function aprovarEnviar() {
    if (!proposta || disparando) return
    if (publico.length === 0) { setErro('Nenhum cliente casou com esses tamanhos.'); return }
    setDisparando(true); setErro(null)
    try {
      const res = await fetch('/api/campanhas/consultora/disparar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: proposta.titulo,
          objetivo: proposta.objetivo,
          marca: proposta.marca,
          copy_texto: copyEditada,
          copy_descritor: proposta.copy_descritor,
          publico_ids: publico.map(p => p.id),
        }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro ?? 'Falha ao enviar.'); return }
      setResultado(`✅ Oferta enviada para ${data.enviados} cliente(s)! ${data.por_template ?? 0} por template (frios) e ${data.por_texto ?? 0} direto (quentes). As respostas caem no atendimento.`)
      setProposta(null); setPublico([])
    } catch { setErro('Erro de conexão.') } finally { setDisparando(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.25rem)] lg:h-screen max-w-3xl mx-auto w-full px-4 py-4 gap-3">
      <div className="shrink-0">
        <h1 className="text-lg font-bold text-white">🎯 Consultora de Campanhas</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Me conta o que você quer vender que eu monto a oferta e acho os clientes certos.</p>
      </div>

      {/* Conversa */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pr-1">
        {msgs.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">💡</p>
            <p className="text-zinc-300 font-medium">O que a gente vende hoje?</p>
            <div className="flex flex-col gap-2 mt-4 max-w-sm mx-auto">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)}
                  className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-400 px-3 py-2 rounded-lg transition cursor-pointer">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.papel === 'dono' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
              m.papel === 'dono' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
            }`}>{m.conteudo}</div>
          </div>
        ))}
        {pensando && <div className="flex justify-start"><div className="bg-zinc-800 text-zinc-500 rounded-2xl px-4 py-2.5 text-sm animate-pulse">pensando...</div></div>}

        {/* Proposta pronta */}
        {proposta && (
          <div className="rounded-2xl border border-violet-500/40 bg-violet-500/5 p-4 flex flex-col gap-3">
            <div>
              <p className="text-base font-bold text-white">{proposta.titulo}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {proposta.tamanhos?.length ? `Tamanhos: ${proposta.tamanhos.join(', ')}` : ''}
                {proposta.marca ? ` · ${proposta.marca}` : ''}
                {proposta.desconto ? ` · ${proposta.desconto} off` : ''}
              </p>
            </div>

            <div className="rounded-lg bg-zinc-900/60 border border-zinc-700/40 p-3">
              <p className="text-xs font-semibold text-zinc-400 mb-1">👥 {publico.length} cliente(s) casaram (vestem os tamanhos)</p>
              {publico.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {publico.slice(0, 14).map(p => (
                    <span key={p.id} className="text-[11px] bg-zinc-700 text-zinc-200 px-2 py-0.5 rounded-full" title={p.motivo}>{p.nome.split(' ')[0]}</span>
                  ))}
                  {publico.length > 14 && <span className="text-[11px] text-zinc-500 px-1">+{publico.length - 14}</span>}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">💬 Copy (edite à vontade — {'{nome}'} vira o primeiro nome)</p>
              <textarea value={copyEditada} onChange={e => setCopyEditada(e.target.value)} rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 resize-y focus:outline-none focus:border-violet-500 [color-scheme:dark]" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={aprovarEnviar} disabled={disparando || publico.length === 0}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                {disparando ? 'Enviando...' : `📤 Aprovar e enviar (${publico.length})`}
              </button>
              <button onClick={() => setProposta(null)} disabled={disparando}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition cursor-pointer">
                Descartar
              </button>
            </div>
          </div>
        )}

        {erro && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{erro}</div>}
        {resultado && <div className="rounded-xl border border-[#00D4AA]/30 bg-[#00D4AA]/5 p-4 text-sm text-zinc-200">{resultado}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0 border-t border-zinc-800 pt-3">
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder="Responde a consultora..." rows={1} disabled={pensando}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500 [color-scheme:dark]" />
        <button onClick={() => enviar()} disabled={!input.trim() || pensando}
          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition cursor-pointer">Enviar</button>
      </div>

      {/* Histórico compacto */}
      {campanhas.length > 0 && (
        <details className="shrink-0 text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">Campanhas anteriores ({campanhas.length})</summary>
          <div className="flex flex-col gap-1.5 mt-2 max-h-40 overflow-y-auto">
            {campanhas.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className="text-zinc-300 truncate">{c.nome}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.status === 'ativa' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-zinc-700 text-zinc-400'}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
