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

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoEnvio[] | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)

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
        <button
          type="button"
          onClick={enviarPacoteInicial}
          disabled={enviando}
          className="px-4 py-2.5 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition shrink-0"
        >
          {enviando ? 'Enviando…' : 'Enviar pacote inicial para aprovação'}
        </button>
      </div>

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
