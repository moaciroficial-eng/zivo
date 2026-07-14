'use client'

import { useState } from 'react'

type CampanhaRow = {
  id: string; nome: string; objetivo: string | null
  copy_whatsapp: string | null; status: string; created_at: string
}
type Proposta = {
  titulo: string; objetivo: string; publico_descricao: string; publico_criterio: string
  mensagem: string; produtos_destaque: string[]; dica: string
}

/* Datas comemorativas com a próxima ocorrência já calculada no cliente */
const OCASIOES = [
  { key: 'dia_dos_pais',      label: 'Dia dos Pais',      emoji: '👔' },
  { key: 'dia_das_maes',      label: 'Dia das Mães',      emoji: '💐' },
  { key: 'dia_dos_namorados', label: 'Dia dos Namorados', emoji: '❤️' },
  { key: 'dia_das_criancas',  label: 'Dia das Crianças',  emoji: '🧸' },
  { key: 'black_friday',      label: 'Black Friday',      emoji: '🏷️' },
  { key: 'natal',             label: 'Natal',             emoji: '🎄' },
]

export default function CampanhasClient({ campanhas }: { campanhas: CampanhaRow[] }) {
  const [ocasiao, setOcasiao] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [msgEditada, setMsgEditada] = useState('')
  const [totalPublico, setTotalPublico] = useState(0)
  const [amostra, setAmostra] = useState<string[]>([])
  const [disparando, setDisparando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar(key: string) {
    setOcasiao(key); setGerando(true); setProposta(null); setResultado(null); setErro(null)
    try {
      const res = await fetch('/api/campanhas/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocasiao: key }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro ?? 'Não consegui gerar a campanha.'); return }
      setProposta(data.proposta)
      setMsgEditada(data.proposta.mensagem)
      setTotalPublico(data.total_publico)
      setAmostra(data.amostra ?? [])
    } catch { setErro('Erro de conexão.') } finally { setGerando(false) }
  }

  async function disparar() {
    if (!proposta || !ocasiao || disparando) return
    if (totalPublico === 0) { setErro('Nenhum cliente no público-alvo.'); return }
    setDisparando(true); setErro(null)
    try {
      const res = await fetch('/api/campanhas/disparar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocasiao, criterio: proposta.publico_criterio, titulo: proposta.titulo,
          mensagem: msgEditada, objetivo: proposta.objetivo, publico_descricao: proposta.publico_descricao,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro ?? 'Falha ao disparar.'); return }
      setResultado(`✅ Campanha disparada para ${data.enviados} cliente(s)!${data.excedente ? ` (${data.excedente} ficaram pra um próximo envio)` : ''} As respostas caem no atendimento e as vendas são atribuídas automaticamente.`)
      setProposta(null)
    } catch { setErro('Erro de conexão.') } finally { setDisparando(false) }
  }

  const ocasiaoLabel = OCASIOES.find(o => o.key === ocasiao)?.label ?? ''

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-white">🎯 Campanhas</h1>
        <p className="text-sm text-zinc-500 mt-1">Um especialista em marketing cruza suas vendas, o calendário e o estoque pra criar campanhas prontas. Você revisa e dispara.</p>
      </div>

      {/* Escolha da ocasião */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Estrear com qual data?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {OCASIOES.map(o => (
            <button key={o.key} onClick={() => gerar(o.key)} disabled={gerando}
              className={`px-3 py-3 rounded-xl border text-sm font-medium transition cursor-pointer disabled:opacity-50 ${
                ocasiao === o.key ? 'bg-violet-600/20 border-violet-500/40 text-violet-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}>
              <span className="text-lg mr-1">{o.emoji}</span> {o.label}
            </button>
          ))}
        </div>
      </div>

      {gerando && (
        <div className="text-center py-10 text-zinc-500 text-sm animate-pulse">
          🧠 O especialista está montando a campanha de {ocasiaoLabel}...
        </div>
      )}

      {erro && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{erro}</div>}
      {resultado && <div className="rounded-xl border border-[#00D4AA]/30 bg-[#00D4AA]/5 p-4 text-sm text-zinc-200">{resultado}</div>}

      {/* Proposta */}
      {proposta && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col gap-4">
          <div>
            <p className="text-base font-bold text-white">{proposta.titulo}</p>
            <p className="text-sm text-zinc-400 mt-0.5">{proposta.objetivo}</p>
          </div>

          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 p-3">
            <p className="text-xs font-semibold text-zinc-400 mb-1">👥 Público-alvo — {totalPublico} cliente(s)</p>
            <p className="text-sm text-zinc-300">{proposta.publico_descricao}</p>
            {amostra.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {amostra.map((n, i) => <span key={i} className="text-[11px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">{n}</span>)}
                {totalPublico > amostra.length && <span className="text-[11px] text-zinc-500 px-1">+{totalPublico - amostra.length}</span>}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">💬 Mensagem (edite à vontade — {'{nome}'} vira o primeiro nome de cada cliente)</p>
            <textarea value={msgEditada} onChange={e => setMsgEditada(e.target.value)} rows={5}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 resize-y focus:outline-none focus:border-violet-500 [color-scheme:dark]" />
          </div>

          {proposta.produtos_destaque.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">🛍️ Produtos em destaque</p>
              <div className="flex flex-wrap gap-1.5">
                {proposta.produtos_destaque.map((p, i) => <span key={i} className="text-xs bg-zinc-800 border border-zinc-700/60 text-zinc-300 px-2 py-1 rounded-lg">{p}</span>)}
              </div>
            </div>
          )}

          {proposta.dica && <p className="text-xs text-zinc-500 italic">💡 {proposta.dica}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={disparar} disabled={disparando || totalPublico === 0}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition cursor-pointer">
              {disparando ? 'Disparando...' : `📤 Disparar para ${totalPublico} cliente(s)`}
            </button>
            <button onClick={() => setProposta(null)} disabled={disparando}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition cursor-pointer">
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Histórico */}
      {campanhas.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Campanhas anteriores</p>
          <div className="flex flex-col gap-2">
            {campanhas.map(c => (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-200">{c.nome}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === 'ativa' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-zinc-700 text-zinc-400'}`}>{c.status}</span>
                </div>
                {c.copy_whatsapp && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{c.copy_whatsapp}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
