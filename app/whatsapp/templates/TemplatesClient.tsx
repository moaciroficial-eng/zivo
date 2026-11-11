'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Template = { name: string; status?: string; category?: string; rejected_reason?: string }
type ResultadoEnvio = { name: string; ok: boolean; motivo?: string; jaExistia?: boolean }

const STATUS_LABEL: Record<string, { texto: string; className: string }> = {
  APPROVED: { texto: 'Aprovado', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  PENDING: { texto: 'Em análise', className: 'bg-[#C79A54]/15 text-[#E0B36A] border-[#C79A54]/30' },
  REJECTED: { texto: 'Rejeitado', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  IN_APPEAL: { texto: 'Em recurso', className: 'bg-[#C79A54]/15 text-[#E0B36A] border-[#C79A54]/30' },
  PAUSED: { texto: 'Pausado', className: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40' },
  DISABLED: { texto: 'Desativado', className: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40' },
}

function StatusBadge({ status }: { status?: string }) {
  const info = (status && STATUS_LABEL[status]) || { texto: status || 'Desconhecido', className: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40' }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${info.className}`}>{info.texto}</span>
}

const INPUT = 'w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#C79A54]/60 focus:ring-1 focus:ring-[#C79A54]/30 transition'
const LABEL = 'block text-xs font-medium text-zinc-400 mb-1.5'

/* mesma regra que a rota valida de novo no servidor -- aqui é só pra
   avisar o dono ANTES de mandar, não deixar ele descobrir só depois */
function validarTexto(nome: string, texto: string): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(nome)) return 'Nome só pode ter letras minúsculas, números e _ (sem espaço/acento, começando com letra).'
  const corpo = texto.trim()
  if (!corpo) return 'Escreva o texto do template.'
  if (/^\{\{\d+\}\}/.test(corpo)) return 'O texto não pode começar com uma variável — precisa de uma palavra antes.'
  if (/\{\{\d+\}\}$/.test(corpo)) return 'O texto não pode terminar com uma variável — precisa de uma palavra depois.'
  const nums = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
  const unicos = [...new Set(nums)].sort((a, b) => a - b)
  for (let i = 0; i < unicos.length; i++) if (unicos[i] !== i + 1) return `As variáveis precisam ser sequenciais a partir de {{1}} (achei: ${unicos.join(', ') || 'nenhuma'}).`
  return null
}

function contarVariaveis(texto: string): number {
  return new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size
}

function CriarTemplateModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState<'MARKETING' | 'UTILITY'>('MARKETING')
  const [texto, setTexto] = useState('')
  const [footer, setFooter] = useState('Moca · Roda Velha')
  const [botoes, setBotoes] = useState<string[]>([])
  const [exemplos, setExemplos] = useState<string[]>([])
  const [brief, setBrief] = useState('')
  const [sugerindo, setSugerindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const qtdVars = contarVariaveis(texto)

  async function sugerirComIA() {
    if (!brief.trim()) return
    setSugerindo(true)
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/templates/sugerir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Falha ao sugerir.'); return }
      setNome(data.sugestao?.name || nome)
      setTexto(data.sugestao?.bodyText || texto)
      setBotoes(Array.isArray(data.sugestao?.buttons) ? data.sugestao.buttons.slice(0, 3) : botoes)
    } catch {
      setErro('Falha ao sugerir.')
    } finally {
      setSugerindo(false)
    }
  }

  async function enviar() {
    const erroValidacao = validarTexto(nome, texto)
    if (erroValidacao) { setErro(erroValidacao); return }
    if (exemplos.slice(0, qtdVars).some(e => !e?.trim())) { setErro(`Preencha um exemplo pra cada uma das ${qtdVars} variável(is).`); return }

    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/templates/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, category: categoria, bodyText: texto, examples: exemplos, buttons: botoes, footer }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Falha ao enviar.'); return }
      setOk(true)
      onCriado()
    } catch {
      setErro('Falha ao enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Criar template</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none">×</button>
        </div>

        {ok ? (
          <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400">
            Enviado pra aprovação da Meta. Acompanhe o status na lista.
          </div>
        ) : (
          <>
            <div>
              <label className={LABEL}>Pedir sugestão pra IA (opcional)</label>
              <div className="flex gap-2">
                <input value={brief} onChange={e => setBrief(e.target.value)} placeholder="Ex.: avisar que chegou coleção de inverno" className={INPUT} />
                <button type="button" onClick={sugerirComIA} disabled={sugerindo || !brief.trim()} className="px-3 py-2.5 bg-zinc-700/60 hover:bg-zinc-700 disabled:opacity-50 text-xs text-zinc-200 rounded-xl transition shrink-0">
                  {sugerindo ? 'Pensando…' : 'Sugerir'}
                </button>
              </div>
            </div>

            <div>
              <label className={LABEL}>Nome do template</label>
              <input value={nome} onChange={e => setNome(e.target.value.toLowerCase())} placeholder="ex: colecao_inverno" className={`${INPUT} font-mono`} />
            </div>

            <div>
              <label className={LABEL}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as 'MARKETING' | 'UTILITY')} className={`${INPUT} appearance-none`}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidade</option>
              </select>
            </div>

            <div>
              <label className={LABEL}>Texto — use {'{{1}}'}, {'{{2}}'}... pras variáveis (nunca no início nem no fim)</label>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} placeholder="Oi, {{1}}! ..." className={`${INPUT} resize-none`} />
            </div>

            {qtdVars > 0 && (
              <div>
                <label className={LABEL}>Exemplo de cada variável (pra Meta avaliar)</label>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: qtdVars }).map((_, i) => (
                    <input
                      key={i}
                      value={exemplos[i] ?? ''}
                      onChange={e => setExemplos(ex => { const novo = [...ex]; novo[i] = e.target.value; return novo })}
                      placeholder={`Exemplo pra {{${i + 1}}}`}
                      className={INPUT}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={LABEL}>Botões de resposta rápida (até 3, opcional)</label>
              <div className="flex flex-col gap-2">
                {botoes.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={b}
                      onChange={e => setBotoes(bs => { const novo = [...bs]; novo[i] = e.target.value; return novo })}
                      maxLength={25}
                      className={INPUT}
                    />
                    <button type="button" onClick={() => setBotoes(bs => bs.filter((_, j) => j !== i))} className="px-3 text-zinc-500 hover:text-red-400 transition">×</button>
                  </div>
                ))}
                {botoes.length < 3 && (
                  <button type="button" onClick={() => setBotoes(bs => [...bs, ''])} className="text-xs text-zinc-500 hover:text-zinc-300 transition text-left">+ adicionar botão</button>
                )}
              </div>
            </div>

            <div>
              <label className={LABEL}>Rodapé</label>
              <input value={footer} onChange={e => setFooter(e.target.value)} className={INPUT} />
            </div>

            {erro && <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{erro}</div>}

            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="px-4 py-2.5 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 text-zinc-950 text-sm font-semibold rounded-xl transition"
            >
              {enviando ? 'Enviando…' : 'Enviar pra aprovação da Meta'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoEnvio[] | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)
  const [criarAberto, setCriarAberto] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/templates')
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Falha ao carregar templates.'); setTemplates([]) }
      else setTemplates(data.templates ?? [])
    } catch {
      setErro('Falha ao carregar templates.')
      setTemplates([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  async function enviarPacoteInicial() {
    setEnviando(true)
    setResultados(null)
    try {
      const res = await fetch('/api/whatsapp/templates/enviar-pacote-inicial', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) setErro(data.erro || 'Falha ao enviar o pacote inicial.')
      else setResultados(data.resultados ?? [])
    } catch {
      setErro('Falha ao enviar o pacote inicial.')
    } finally {
      setEnviando(false)
      carregar()
    }
  }

  async function reenviar(name: string) {
    setReenviando(name)
    setErro(null)
    try {
      const res = await fetch('/api/whatsapp/templates/reenviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!data.ok) setErro(data.erro || `Falha ao reenviar ${name}.`)
      else setResultados([data.resultado])
    } catch {
      setErro(`Falha ao reenviar ${name}.`)
    } finally {
      setReenviando(null)
      carregar()
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/whatsapp" className="hover:text-zinc-300 transition">WhatsApp</Link>
        <span>/</span>
        <span className="text-zinc-300">Templates</span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Templates de mensagem</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Templates pré-aprovados pela Meta pra iniciar conversa com o cliente.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCriarAberto(true)}
            className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 hover:border-[#C79A54]/60 text-zinc-200 text-sm font-semibold rounded-xl transition"
          >
            Criar template
          </button>
          <button
            type="button"
            onClick={enviarPacoteInicial}
            disabled={enviando}
            className="px-4 py-2.5 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition"
          >
            {enviando ? 'Enviando…' : 'Enviar pacote inicial para aprovação'}
          </button>
        </div>
      </div>

      {criarAberto && (
        <CriarTemplateModal onClose={() => setCriarAberto(false)} onCriado={carregar} />
      )}

      {erro && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{erro}</div>
      )}

      {resultados && (
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-300">Resultado do envio</p>
          {resultados.map(r => (
            <div key={r.name} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400 font-mono">{r.name}</span>
              {r.ok
                ? <span className="text-emerald-400">{r.jaExistia ? 'já existia' : 'enviado pra análise'}</span>
                : <span className="text-red-400 text-right">{r.motivo || 'falhou'}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl overflow-hidden">
        {carregando ? (
          <p className="p-4 text-sm text-zinc-500">Carregando…</p>
        ) : !templates || templates.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nenhum template encontrado ainda.</p>
        ) : (
          <div className="divide-y divide-zinc-700/60">
            {templates.map(t => (
              <div key={t.name} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 font-mono truncate">{t.name}</p>
                  {t.rejected_reason && t.rejected_reason !== 'NONE' && (
                    <p className="text-xs text-red-400/80 mt-0.5">{t.rejected_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={t.status} />
                  {t.status === 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => reenviar(t.name)}
                      disabled={reenviando === t.name}
                      className="px-2.5 py-1 bg-zinc-700/60 hover:bg-zinc-700 disabled:opacity-50 text-xs text-zinc-200 rounded-lg transition"
                    >
                      {reenviando === t.name ? 'Reenviando…' : 'Reenviar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
