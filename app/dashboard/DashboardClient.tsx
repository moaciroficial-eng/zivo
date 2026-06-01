'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MetaModal from './MetaModal'
import SaudeFinanceiraModal, { type SaudeDados } from './SaudeFinanceiraModal'
import AiChat from '@/app/components/AiChat'
import MobileNav from '@/app/components/MobileNav'

/* ── Types ────────────────────────────────────────────────────── */

type ProdutoPriorizar = {
  produto_id: string
  nome: string
  preco_venda: number
  estrategia: 'preco_cheio' | 'desconto'
  desconto_sugerido: number | null
  preco_com_desconto: number | null
  motivo: string
  vendido?: boolean
}

type ClienteContatar = {
  cliente_id: string
  nome: string
  telefone: string | null
  motivo: string
  mensagem_whatsapp?: string | null
}

type DiaPlano = {
  data: string
  dia_semana: string
  meta_dia: number
  produtos_priorizar: ProdutoPriorizar[]
  clientes_contatar: ClienteContatar[]
  dica: string
}

type Plano = {
  resumo: {
    meta: number
    vendido: number
    restante: number
    percentual: number
    dias_restantes: number
    media_diaria_necessaria?: number
    vendas_necessarias?: number
  }
  dias: DiaPlano[]
}

type MetaRow = {
  id: string
  mes: string
  valor_meta: number
  plano: Plano | null
  plano_gerado_em: string | null
  plano_vendido_base: number | null
  dividas_atuais: number | null
  despesas_fixas_mensais: number | null
  capital_de_giro: number | null
}

type Props = {
  user: { id: string; email: string }
  mes: string
  totalClientes: number
  totalReceita: number
  totalVendas: number
  vendidoMes: number
  metaInicial: MetaRow | null
}

/* ── Constants ────────────────────────────────────────────────── */

const NAV_LINKS = [
  { href: '/dashboard',            label: 'Dashboard',     active: true  },
  { href: '/clientes',             label: 'Clientes',      active: false },
  { href: '/vendas',               label: 'Vendas',        active: false },
  { href: '/calendario',           label: 'Calendário',    active: false },
  { href: '/estoque',              label: 'Estoque',       active: false },
  { href: '/biblioteca',           label: 'Biblioteca',    active: false },
  { href: '/configuracoes/marcas', label: 'Configurações', active: false },
]

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function fmtNum(n: number) { return fmt.format(n) }

/* ── Helpers ──────────────────────────────────────────────────── */

function isPlanStale(meta: MetaRow, vendidoMes: number): boolean {
  if (!meta.plano || !meta.plano_gerado_em) return true
  // Recalcula se o plano foi gerado em outro dia
  const geradoEm = new Date(meta.plano_gerado_em).toISOString().split('T')[0]
  const hoje = new Date().toISOString().split('T')[0]
  if (geradoEm !== hoje) return true
  // Recalcula se qualquer venda foi registrada desde a última geração
  return (meta.plano_vendido_base ?? 0) !== vendidoMes
}

function getMesLabel(mes: string) {
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

type HealthStatus = 'saudavel' | 'atencao' | 'critico'

function calcHealthStatus(dividas: number, despesas: number, capital: number): HealthStatus {
  let score = 0
  // Capital vs despesas
  if      (capital >= despesas * 2) score += 2
  else if (capital >= despesas)     score += 1
  else                              score -= 1
  // Dívida vs capital
  if      (dividas === 0)              score += 2
  else if (dividas < capital * 0.3)    score += 1
  else if (dividas < capital)          score += 0
  else                                 score -= 2
  if (score >= 3) return 'saudavel'
  if (score >= 0) return 'atencao'
  return 'critico'
}

/* ── Icons ────────────────────────────────────────────────────── */

const IconTarget = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconStar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const IconTag = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l9.59-9.59a1 1 0 0 0 0-1.41z"/><circle cx="7" cy="7" r="1" fill="currentColor"/>
  </svg>
)
const IconPhone = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.88a16 16 0 0 0 5.5 5.5l.88-.88a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 21 15.78z"/>
  </svg>
)
const IconLightbulb = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/><path d="M10 22h4"/>
  </svg>
)
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconRefresh = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
)
const IconShield = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IconAlertTriangle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

/* ── Sub-components ───────────────────────────────────────────── */

function ProdutoCard({ p }: { p: ProdutoPriorizar }) {
  const isDesconto = p.estrategia === 'desconto'
  return (
    <div className={`border rounded-xl p-3.5 flex gap-3 transition ${p.vendido ? 'bg-emerald-900/20 border-emerald-700/40 opacity-70' : 'bg-zinc-800/60 border-zinc-700/60'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${p.vendido ? 'bg-emerald-500/20 text-emerald-400' : isDesconto ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
        {p.vendido ? <span className="text-base">✓</span> : isDesconto ? <IconTag /> : <IconStar />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium leading-snug ${p.vendido ? 'line-through text-zinc-500' : ''}`}>{p.nome}</p>
          {p.vendido && <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">Vendido ✓</span>}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {isDesconto && p.preco_com_desconto != null ? (
            <>
              <span className="text-xs text-zinc-500 line-through">{fmtNum(p.preco_venda)}</span>
              <span className="text-sm font-bold text-amber-400">{fmtNum(p.preco_com_desconto)}</span>
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                -{p.desconto_sugerido}%
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-emerald-400">{fmtNum(p.preco_venda)}</span>
          )}
          {!p.vendido && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${isDesconto ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
              {isDesconto ? 'Desconto' : 'Preço cheio'}
            </span>
          )}
        </div>
        {!p.vendido && <p className="text-xs text-zinc-500 mt-1">{p.motivo}</p>}
      </div>
    </div>
  )
}

function ClienteCard({ c }: { c: ClienteContatar }) {
  const waUrl = c.telefone
    ? `https://wa.me/55${c.telefone.replace(/\D/g, '')}${c.mensagem_whatsapp ? `?text=${encodeURIComponent(c.mensagem_whatsapp)}` : ''}`
    : null

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3.5 flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
        <IconPhone />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{c.nome}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{c.motivo}</p>
        {c.mensagem_whatsapp && (
          <p className="text-xs text-zinc-600 mt-1 italic leading-relaxed">&ldquo;{c.mensagem_whatsapp}&rdquo;</p>
        )}
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 transition"
          >
            <IconPhone /> Enviar no WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

function SkeletonPlan() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 bg-zinc-800 rounded-xl" />
      ))}
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────── */

export default function DashboardClient({
  user, mes, totalClientes, totalReceita, totalVendas, vendidoMes, metaInicial,
}: Props) {
  const [meta,           setMeta]           = useState<MetaRow | null>(metaInicial)
  const [plano,          setPlano]          = useState<Plano | null>(metaInicial?.plano ?? null)
  const [isGenerating,   setIsGenerating]   = useState(false)
  const [generateError,  setGenerateError]  = useState<string | null>(null)
  const [showMetaModal,  setShowMetaModal]  = useState(false)
  const [showSaudeModal, setShowSaudeModal] = useState(false)
  const [showNextDays,   setShowNextDays]   = useState(false)

  const hoje = new Date().toISOString().split('T')[0]

  const generatePlan = useCallback(async () => {
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/gerar-plano', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Erro ${res.status}`)
      }
      const { plano: newPlano } = await res.json() as { plano: Plano }
      setPlano(newPlano)
      setMeta(prev => prev ? { ...prev, plano: newPlano, plano_vendido_base: vendidoMes } : prev)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Não foi possível gerar o plano. Tente novamente.')
    } finally {
      setIsGenerating(false)
    }
  }, [mes, vendidoMes])

  useEffect(() => {
    if (meta && isPlanStale(meta, vendidoMes)) generatePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recalcula quando o usuário volta à aba após registrar uma venda
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && meta && isPlanStale(meta, vendidoMes)) {
        generatePlan()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, vendidoMes])

  async function handleSaveMeta(valor: number) {
    const res = await fetch('/api/salvar-meta', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mes, valor_meta: valor }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Erro ao salvar')
    }
    const { meta: newMeta } = await res.json() as { meta: MetaRow }
    setMeta(newMeta)
    setPlano(null)
    setShowMetaModal(false)
    await generatePlan()
  }

  async function handleSaveSaude(dados: SaudeDados) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('metas')
      .update({
        dividas_atuais:         dados.dividas,
        despesas_fixas_mensais: dados.despesas_fixas,
        capital_de_giro:        dados.capital_de_giro,
      })
      .eq('user_id', user.id)
      .eq('mes', mes)
      .select().single()
    if (error) throw error
    setMeta(data as MetaRow)
    setShowSaudeModal(false)
    await generatePlan()
  }

  /* ── Derived values ─────────────────────────────────────────── */

  const diasPlano    = plano?.dias ?? []
  const diaHoje      = diasPlano.find(d => d.data === hoje) ?? diasPlano[0] ?? null
  const proximosDias = diasPlano.filter(d => d.data > hoje).slice(0, 4)

  const pct         = meta ? Math.min(100, Math.round((vendidoMes / meta.valor_meta) * 100)) : 0
  const restanteMes = meta ? Math.max(0, meta.valor_meta - vendidoMes) : 0

  // Financial health calculations
  const temSaude      = !!(meta?.despesas_fixas_mensais)
  const despesas      = meta?.despesas_fixas_mensais ?? 0
  const dividas       = meta?.dividas_atuais ?? 0
  const capitalGiro   = meta?.capital_de_giro ?? 0
  const diasNoMes     = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0).getDate()
  const pontoEqMensal = despesas
  const pontoEqDiario = despesas > 0 ? despesas / diasNoMes : 0
  const margemLiquida = meta ? meta.valor_meta - despesas : 0
  const coberturaMeses = despesas > 0 ? capitalGiro / despesas : null
  const healthStatus: HealthStatus | null = temSaude
    ? calcHealthStatus(dividas, despesas, capitalGiro)
    : null

  const healthConfig = {
    saudavel: { label: 'Saudável',  dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5'  },
    atencao:  { label: 'Atenção',   dot: 'bg-amber-400',   text: 'text-amber-400',   border: 'border-amber-500/20',   bg: 'bg-amber-500/5'    },
    critico:  { label: 'Crítico',   dot: 'bg-red-400',     text: 'text-red-400',     border: 'border-red-500/20',     bg: 'bg-red-500/5'      },
  }
  const hc = healthStatus ? healthConfig[healthStatus] : null

  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-20 md:pb-0">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="3" fill="white"/>
                </svg>
              </div>
              <span className="font-bold">zivo</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {NAV_LINKS.map(l => (
                <Link key={l.href} href={l.href}
                  className={`px-3 py-1.5 rounded-lg transition ${l.active ? 'font-medium bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >{l.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition cursor-pointer">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-zinc-400 mt-1 text-sm">Autenticado como <span className="text-violet-400">{user.email}</span></p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Link href="/clientes" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Clientes</p>
            <p className="text-3xl font-bold mt-1">{totalClientes}</p>
          </Link>
          <Link href="/vendas" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Receita Total</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{fmtNum(totalReceita)}</p>
          </Link>
          <Link href="/vendas" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Vendas</p>
            <p className="text-3xl font-bold mt-1">{totalVendas}</p>
          </Link>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Meta {getMesLabel(mes)}</p>
            {meta ? (
              <>
                <p className="text-2xl font-bold mt-1 text-violet-400">{fmtNum(meta.valor_meta)}</p>
                <div className="mt-2">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{pct}% atingido</p>
                </div>
              </>
            ) : (
              <button onClick={() => setShowMetaModal(true)} className="mt-2 text-xs font-semibold text-violet-400 hover:text-violet-300 transition text-left cursor-pointer">
                + Definir meta →
              </button>
            )}
          </div>
        </div>

        {/* ── Meta section ──────────────────────────────────────── */}
        {!meta ? (
          <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400"><IconTarget /></div>
            <div>
              <p className="font-semibold text-lg">Defina sua meta de faturamento</p>
              <p className="text-zinc-400 text-sm mt-1 max-w-sm">A IA cria um plano de vendas diário com produtos a priorizar e clientes a contatar para você bater a meta.</p>
            </div>
            <button onClick={() => setShowMetaModal(true)} className="mt-1 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition cursor-pointer">
              Definir meta do mês
            </button>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Meta progress */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-violet-400"><IconTarget /></div>
                  <span className="font-semibold">Meta de {getMesLabel(mes)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {!isGenerating && (
                    <button onClick={generatePlan}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2.5 py-1.5 transition cursor-pointer">
                      <IconRefresh /> Recalcular
                    </button>
                  )}
                  <button onClick={() => setShowMetaModal(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2.5 py-1.5 transition cursor-pointer">
                    <IconEdit /> Editar meta
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Vendido este mês</p>
                  <p className="text-xl font-bold text-emerald-400">{fmtNum(vendidoMes)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Falta</p>
                  <p className="text-xl font-bold">{fmtNum(restanteMes)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Meta</p>
                  <p className="text-xl font-bold text-violet-400">{fmtNum(meta.valor_meta)}</p>
                </div>
              </div>

              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-zinc-500 mt-1.5">
                <span>{pct}% atingido</span>
                {plano?.resumo.vendas_necessarias != null && <span>{plano.resumo.vendas_necessarias} vendas necessárias</span>}
                {plano?.resumo.media_diaria_necessaria != null && plano.resumo.vendas_necessarias == null && <span>Média: {fmtNum(plano.resumo.media_diaria_necessaria)}/dia</span>}
              </div>
            </div>

            {/* ── Financial health panel ─────────────────────── */}
            {temSaude && hc ? (
              <div className={`bg-zinc-900 border rounded-2xl p-5 ${hc.border} ${hc.bg}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={hc.text}><IconShield /></div>
                    <span className="font-semibold">Saúde Financeira</span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${hc.text} bg-zinc-800`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hc.dot}`} />
                      {hc.label}
                    </span>
                  </div>
                  <button onClick={() => setShowSaudeModal(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2.5 py-1.5 transition cursor-pointer">
                    <IconEdit /> Editar
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Ponto de equilíbrio</p>
                    <p className="text-base font-bold">{fmtNum(pontoEqMensal)}<span className="text-xs text-zinc-500">/mês</span></p>
                    <p className="text-xs text-zinc-600">{fmtNum(pontoEqDiario)}/dia</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Margem após despesas</p>
                    <p className={`text-base font-bold ${margemLiquida >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtNum(margemLiquida)}
                    </p>
                    {margemLiquida < 0 && (
                      <p className="text-xs text-red-400">Meta insuficiente</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Capital de giro</p>
                    <p className="text-base font-bold">{fmtNum(capitalGiro)}</p>
                    {coberturaMeses !== null && (
                      <p className={`text-xs ${coberturaMeses >= 2 ? 'text-emerald-400' : coberturaMeses >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                        {coberturaMeses.toFixed(1)} meses de cobertura
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Dívidas</p>
                    <p className={`text-base font-bold ${dividas === 0 ? 'text-emerald-400' : dividas > capitalGiro ? 'text-red-400' : 'text-amber-400'}`}>
                      {fmtNum(dividas)}
                    </p>
                    {dividas > 0 && capitalGiro > 0 && (
                      <p className="text-xs text-zinc-500">
                        {((dividas / capitalGiro) * 100).toFixed(0)}% do capital
                      </p>
                    )}
                  </div>
                </div>

                {/* Alertas */}
                <div className="space-y-1.5">
                  {margemLiquida < 0 && (
                    <div className="flex items-start gap-2 text-xs text-red-400">
                      <IconAlertTriangle /><span>Meta abaixo das despesas fixas — aumente a meta ou reduza os custos.</span>
                    </div>
                  )}
                  {dividas > capitalGiro && (
                    <div className="flex items-start gap-2 text-xs text-red-400">
                      <IconAlertTriangle /><span>Dívida supera o capital de giro — plano prioriza margem, sem liquidações agressivas.</span>
                    </div>
                  )}
                  {healthStatus === 'atencao' && dividas > 0 && dividas <= capitalGiro && (
                    <div className="flex items-start gap-2 text-xs text-amber-400">
                      <IconAlertTriangle /><span>Há dívidas em aberto — plano evita descontos maiores que 12% para proteger a margem.</span>
                    </div>
                  )}
                  {coberturaMeses !== null && coberturaMeses < 1 && (
                    <div className="flex items-start gap-2 text-xs text-amber-400">
                      <IconAlertTriangle /><span>Capital de giro cobre menos de 1 mês de despesas — evite promoções que comprometam o caixa.</span>
                    </div>
                  )}
                  {healthStatus === 'saudavel' && (
                    <p className="text-xs text-emerald-400">Situação financeira saudável — plano pode usar descontos estratégicos quando necessário.</p>
                  )}
                </div>
              </div>
            ) : (
              /* CTA para saúde financeira */
              <button
                onClick={() => setShowSaudeModal(true)}
                className="w-full flex items-center justify-between bg-zinc-900 border border-dashed border-zinc-700 hover:border-zinc-600 rounded-2xl px-5 py-4 transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition">
                    <IconShield />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition">Adicionar saúde financeira</p>
                    <p className="text-xs text-zinc-500">Despesas, dívidas e capital de giro — a IA calibra o plano com responsabilidade</p>
                  </div>
                </div>
                <span className="text-zinc-500 group-hover:text-zinc-300 transition text-sm">→</span>
              </button>
            )}

            {/* ── Plan section ──────────────────────────────── */}
            {isGenerating ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                  <span className="text-sm text-zinc-400">Gerando plano com IA…</span>
                </div>
                <SkeletonPlan />
              </div>
            ) : generateError ? (
              <div className="bg-zinc-900 border border-red-900/40 rounded-2xl p-5 flex items-center justify-between gap-4">
                <p className="text-sm text-red-400">{generateError}</p>
                <button onClick={generatePlan} className="text-sm text-zinc-300 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition cursor-pointer shrink-0">
                  Tentar novamente
                </button>
              </div>
            ) : plano ? (
              <>
                {/* Today's plan */}
                {diaHoje && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold">Plano de Hoje</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">{diaHoje.dia_semana}, {diaHoje.data.split('-').reverse().join('/')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Meta do dia</p>
                        <p className="text-lg font-bold text-violet-400">{fmtNum(diaHoje.meta_dia)}</p>
                        {pontoEqDiario > 0 && (
                          <p className={`text-xs mt-0.5 ${diaHoje.meta_dia >= pontoEqDiario ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {diaHoje.meta_dia >= pontoEqDiario ? '✓ cobre despesas' : `⚠ eq: ${fmtNum(pontoEqDiario)}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-5 space-y-5">
                      {diaHoje.produtos_priorizar.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">Produtos para priorizar</p>
                          <div className="space-y-2">
                            {diaHoje.produtos_priorizar.map((p, i) => <ProdutoCard key={i} p={p} />)}
                          </div>
                        </div>
                      )}

                      {diaHoje.clientes_contatar.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">Clientes para contatar</p>
                          <div className="space-y-2">
                            {diaHoje.clientes_contatar.map((c, i) => <ClienteCard key={i} c={c} />)}
                          </div>
                        </div>
                      )}

                      {diaHoje.dica && (
                        <div className="flex items-start gap-2.5 bg-violet-500/5 border border-violet-500/15 rounded-xl p-3.5">
                          <div className="text-violet-400 mt-0.5 shrink-0"><IconLightbulb /></div>
                          <p className="text-sm text-zinc-300">{diaHoje.dica}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Próximos dias */}
                {proximosDias.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setShowNextDays(v => !v)}
                      className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/40 transition"
                    >
                      <h2 className="font-semibold">Próximos dias</h2>
                      <span className={`text-zinc-400 text-xs transition-transform duration-200 ${showNextDays ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                    {showNextDays && (
                      <div className="divide-y divide-zinc-800 border-t border-zinc-800">
                        {proximosDias.map((dia, i) => (
                          <div key={i} className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="font-medium text-sm">{dia.dia_semana}</span>
                                <span className="text-zinc-500 text-sm ml-2">{dia.data.split('-').reverse().join('/')}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-violet-400">{fmtNum(dia.meta_dia)}</span>
                                {pontoEqDiario > 0 && dia.meta_dia > 0 && (
                                  <span className={`ml-2 text-xs ${dia.meta_dia >= pontoEqDiario ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {dia.meta_dia >= pontoEqDiario ? '✓' : '⚠'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1">
                              {dia.produtos_priorizar.slice(0, 2).map((p, j) => (
                                <div key={j} className="flex items-center gap-2 text-xs text-zinc-400">
                                  <span className={p.estrategia === 'desconto' ? 'text-amber-400' : 'text-emerald-400'}>●</span>
                                  <span className="truncate">{p.nome}</span>
                                  <span className="shrink-0 font-medium">
                                    {p.estrategia === 'desconto' && p.preco_com_desconto != null ? fmtNum(p.preco_com_desconto) : fmtNum(p.preco_venda)}
                                  </span>
                                </div>
                              ))}
                              {dia.clientes_contatar.slice(0, 1).map((c, j) => (
                                <div key={j} className="flex items-center gap-2 text-xs text-zinc-500">
                                  <span className="text-violet-400">●</span>
                                  <span className="truncate">{c.nome}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      <AiChat />
      <MobileNav />

      {showMetaModal && (
        <MetaModal
          mes={mes}
          currentMeta={meta?.valor_meta ?? null}
          onClose={() => setShowMetaModal(false)}
          onSave={handleSaveMeta}
        />
      )}

      {showSaudeModal && meta && (
        <SaudeFinanceiraModal
          current={temSaude ? {
            dividas:        dividas,
            despesas_fixas: despesas,
            capital_de_giro: capitalGiro,
          } : null}
          onClose={() => setShowSaudeModal(false)}
          onSave={handleSaveSaude}
        />
      )}
    </div>
  )
}
