'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const AGENTES_SISTEMA = [
  {
    tipo: 'dados',
    nome: 'Agente de Dados',
    descricao: 'Analisa cada conversa e extrai perfil de compra, marcas de interesse, temperatura de compra e alertas automáticos.',
    icon: '🧠',
    cor: 'violet',
  },
  {
    tipo: 'funil',
    nome: 'Agente de Funil',
    descricao: 'Classifica contatos por estágio (topo/fundo), identifica leads quentes e sugere ações para avançar no funil.',
    icon: '🎯',
    cor: 'blue',
    embreve: true,
  },
  {
    tipo: 'campanhas',
    nome: 'Agente de Campanhas',
    descricao: 'Gera copy para WhatsApp e Meta Ads, cria roteiros de reels e segmenta clientes por histórico de compra.',
    icon: '📣',
    cor: 'orange',
    embreve: true,
  },
  {
    tipo: 'cobranca',
    nome: 'Agente de Cobrança',
    descricao: 'Monitora parcelas do crediário, envia lembretes automáticos e alerta sobre inadimplência crescente.',
    icon: '💳',
    cor: 'red',
    embreve: true,
  },
  {
    tipo: 'relacionamento',
    nome: 'Agente de Relacionamento',
    descricao: 'Detecta clientes sumidos, sugere o momento certo para entrar em contato e personaliza a abordagem.',
    icon: '🤝',
    cor: 'green',
    embreve: true,
  },
]

type Agente = {
  id: string; tipo: string; nome: string; ativo: boolean
  ultima_execucao: string | null; total_execucoes: number
}
type Log = {
  id: string; acao: string; created_at: string; contato_id: string | null
  resultado: Record<string, unknown> | null; agentes: { nome: string; tipo: string } | null
}
type Insight = {
  id: string; temperatura: string | null; resumo: string | null
  marcas_interesse: string[] | null; tamanhos: string[] | null
  perfil_compra: string | null; ultima_analise: string | null
  whatsapp_contatos: { nome: string | null; phone: string; foto_url: string | null } | null
}

const COR: Record<string, string> = {
  violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-300',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
  red:    'bg-red-500/10 border-red-500/20 text-red-300',
  green:  'bg-green-500/10 border-green-500/20 text-green-300',
}

const TEMP_LABEL: Record<string, { label: string; cor: string }> = {
  quente: { label: 'Quente 🔥', cor: 'text-orange-400' },
  morno:  { label: 'Morno 🌡', cor: 'text-yellow-400' },
  frio:   { label: 'Frio ❄️', cor: 'text-blue-400' },
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AgentesClient({
  agentes, logs, insights,
}: {
  agentes: Agente[]; logs: Log[]; insights: Insight[]
}) {
  const [tab, setTab] = useState<'agentes' | 'alertas' | 'perfis'>('agentes')
  const [enviando, setEnviando] = useState<string | null>(null)
  const router = useRouter()

  const agenteMap = Object.fromEntries(agentes.map(a => [a.tipo, a]))
  const alertas = logs.filter(l => l.acao.startsWith('['))

  async function enviarSugestao(log: Log) {
    const r = log.resultado
    if (!r?.contato_id || !r?.sugestao) return
    setEnviando(log.id)
    try {
      /* Busca telefone do contato */
      const res = await fetch('/api/agentes/enviar-sugestao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoId: r.contato_id, mensagem: r.sugestao, logId: log.id }),
      })
      if (res.ok) router.refresh()
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 max-w-5xl mx-auto w-full gap-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Central de Agentes</h1>
        <p className="text-sm text-zinc-500 mt-0.5">IA proativa monitorando sua loja em tempo real</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit">
        {(['agentes', 'alertas', 'perfis'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === t ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t === 'agentes' ? 'Agentes' : t === 'alertas' ? `Alertas${alertas.length > 0 ? ` (${alertas.length})` : ''}` : 'Perfis'}
          </button>
        ))}
      </div>

      {/* Tab: Agentes */}
      {tab === 'agentes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AGENTES_SISTEMA.map(ag => {
            const ativo = agenteMap[ag.tipo]
            return (
              <div key={ag.tipo} className={`rounded-xl border p-4 flex flex-col gap-3 ${ag.embreve ? 'opacity-50' : ''} ${COR[ag.cor]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{ag.icon}</span>
                    <div>
                      <p className="font-semibold text-sm">{ag.nome}</p>
                      {ag.embreve && <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded font-medium">Em breve</span>}
                    </div>
                  </div>
                  {!ag.embreve && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ativo ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'}`}>
                      {ativo ? '● ATIVO' : '○ INATIVO'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{ag.descricao}</p>
                {ativo && (
                  <div className="flex gap-4 text-xs text-zinc-500 pt-1 border-t border-white/5">
                    <span>Última execução: {fmtDate(ativo.ultima_execucao)}</span>
                    <span>{ativo.total_execucoes} análises</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: Alertas proativos */}
      {tab === 'alertas' && (
        <div className="flex flex-col gap-3">
          {alertas.length === 0 && (
            <div className="text-center text-zinc-600 py-16 text-sm">
              Nenhum alerta ainda. Os agentes irão avisar aqui quando identificarem algo importante.
            </div>
          )}
          {alertas.map(log => {
            const r = log.resultado ?? {}
            const tipo = (r.tipo as string) ?? ''
            const urgencia = (r.urgencia as string) ?? 'baixa'
            const isSugestao = tipo === 'sugestao_resposta'
            const corUrg = isSugestao
              ? 'border-violet-500/40 bg-violet-500/5'
              : urgencia === 'alta' ? 'border-red-500/40 bg-red-500/5'
              : urgencia === 'media' ? 'border-orange-500/40 bg-orange-500/5'
              : 'border-zinc-700 bg-zinc-900'

            return (
              <div key={log.id} className={`rounded-xl border p-4 flex gap-3 ${corUrg}`}>
                <span className="text-lg shrink-0">
                  {isSugestao ? '💬' : urgencia === 'alta' ? '🚨' : urgencia === 'media' ? '⚠️' : 'ℹ️'}
                </span>
                <div className="flex-1 min-w-0">
                  {isSugestao ? (
                    <>
                      <p className="text-[11px] text-violet-400 font-semibold mb-1">
                        SUGESTÃO DE RESPOSTA — {r.contato as string}
                        {(r.total as number) > 0 ? ` · ${r.total} itens analisados` : ' · sem estoque da marca'}
                      </p>
                      <p className="text-sm text-zinc-100 leading-snug bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-700">
                        {r.sugestao as string}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => enviarSugestao(log)}
                          disabled={enviando === log.id}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          {enviando === log.id ? 'Enviando...' : '▶ Enviar pelo WhatsApp'}
                        </button>
                        <span className="text-[11px] text-zinc-500">{fmtDate(log.created_at)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-100 leading-snug">{log.acao}</p>
                      <div className="flex gap-3 mt-1.5 text-[11px] text-zinc-500">
                        <span>{log.agentes?.nome ?? 'Agente'}</span>
                        <span>{fmtDate(log.created_at)}</span>
                        <span className={`font-semibold ${urgencia === 'alta' ? 'text-red-400' : urgencia === 'media' ? 'text-orange-400' : 'text-zinc-500'}`}>
                          {urgencia.toUpperCase()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: Perfis dos contatos */}
      {tab === 'perfis' && (
        <div className="flex flex-col gap-3">
          {insights.length === 0 && (
            <div className="text-center text-zinc-600 py-16 text-sm">
              Nenhum perfil ainda. O Agente de Dados analisa as conversas automaticamente ao receber mensagens.
            </div>
          )}
          {insights.map(ins => {
            const contato = ins.whatsapp_contatos
            const temp = ins.temperatura ? TEMP_LABEL[ins.temperatura] : null
            return (
              <div key={ins.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-600/20 text-violet-300 flex items-center justify-center text-sm font-bold shrink-0 uppercase overflow-hidden">
                  {contato?.foto_url
                    ? <img src={contato.foto_url} alt="" className="w-full h-full object-cover" />
                    : (contato?.nome ?? '?')[0]
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{contato?.nome ?? contato?.phone ?? '—'}</span>
                    {temp && <span className={`text-xs font-semibold ${temp.cor}`}>{temp.label}</span>}
                    {ins.perfil_compra && (
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{ins.perfil_compra}</span>
                    )}
                  </div>
                  {ins.resumo && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{ins.resumo}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(ins.marcas_interesse ?? []).map(m => (
                      <span key={m} className="text-[10px] bg-violet-500/10 text-violet-300 border border-violet-500/20 px-1.5 py-0.5 rounded">{m}</span>
                    ))}
                    {(ins.tamanhos ?? []).map(t => (
                      <span key={t} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-2">Última análise: {fmtDate(ins.ultima_analise)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
