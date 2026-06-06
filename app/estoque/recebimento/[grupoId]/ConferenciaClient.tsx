'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Produto } from '../../types'
import { imageToBase64 } from '../../_utils/imageUtils'

/* ── Types ── */

type ScanResult = {
  etiqueta: {
    nome:           string | null
    marca:          string | null
    tamanho:        string | null
    cor:            string | null
    preco_venda:    number | null
    codigo_produto: string | null
  }
  match_produto_id:   string | null
  confianca:          'alta' | 'media' | 'baixa' | 'nenhuma'
  divergencias:       string[]
  ok:                 boolean
  preco_venda_esperado: number | null
}

/* ── Helpers ── */

function fBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function totalQtd(tamanhos: Produto['tamanhos']) {
  return tamanhos.reduce((s, t) => s + t.qtd, 0)
}

/* ── Icons ── */

const IconCamera = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 18 4 13"/>
  </svg>
)
const IconX = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconSpinner = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)
const IconWarning = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
)
const IconBack = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconTrash = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

/* ── Component ── */

export default function ConferenciaClient({
  user,
  grupoId,
  produtos,
}: {
  user: { id: string; email: string }
  grupoId: string
  produtos: Produto[]
}) {
  const supabase = createClient()
  const router   = useRouter()
  const scanRef  = useRef<HTMLInputElement>(null)

  const COUNTS_KEY = `conferencia_counts_${grupoId}`

  // Contagens escaneadas (persistidas em localStorage)
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '{}') } catch { return {} }
  })

  // Estado do scan atual
  const [scanning,         setScanning]         = useState(false)
  const [scanResult,       setScanResult]        = useState<ScanResult | null>(null)
  const [scanError,        setScanError]         = useState('')
  const [selectedProdId,   setSelectedProdId]    = useState<string>('')  // match manual
  const [priceDecision,    setPriceDecision]     = useState<'pending' | 'accepted' | 'ignored'>('pending')

  // Estado de fechamento
  const [closing,          setClosing]           = useState(false)
  const [showCloseConfirm, setShowCloseConfirm]  = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [toast,            setToast]             = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    localStorage.setItem(COUNTS_KEY, JSON.stringify(counts))
  }, [counts, COUNTS_KEY])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Scan ── */

  async function handleScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setScanning(true)
    setScanResult(null)
    setScanError('')
    setSelectedProdId('')
    setPriceDecision('pending')

    try {
      const base64 = await imageToBase64(file)
      const res = await fetch('/api/conferencia-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupoId, image: base64, mediaType: 'image/jpeg' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ScanResult = await res.json()
      if ('error' in data) throw new Error((data as { error: string }).error)

      setScanResult(data)
      setSelectedProdId(data.match_produto_id ?? '')
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Erro ao escanear etiqueta')
    } finally {
      setScanning(false)
    }
  }

  /* ── Confirmar scan ── */

  async function confirmScan() {
    const prodId = selectedProdId || scanResult?.match_produto_id
    if (!prodId) { setScanError('Selecione o produto correspondente antes de confirmar.'); return }

    // Atualiza preço de venda se o usuário aceitou
    if (priceDecision === 'accepted' && scanResult?.etiqueta.preco_venda != null) {
      const { error } = await supabase
        .from('estoque')
        .update({ preco_venda: scanResult.etiqueta.preco_venda })
        .eq('id', prodId)
      if (error) { showToast('Erro ao atualizar preço.', 'error'); return }
      showToast('Preço de venda atualizado.')
    }

    setCounts(prev => ({ ...prev, [prodId]: (prev[prodId] ?? 0) + 1 }))
    setScanResult(null)
    setScanError('')
    setSelectedProdId('')
    setPriceDecision('pending')
  }

  /* ── Fechar conferência ── */

  async function closeConferencia(force = false) {
    const totalEsperado = produtos.reduce((s, p) => s + totalQtd(p.tamanhos), 0)
    const totalScanned  = Object.values(counts).reduce((s, n) => s + n, 0)

    if (!force && totalScanned < totalEsperado) {
      setShowCloseConfirm(true)
      return
    }

    setClosing(true)
    const ids = produtos.map(p => p.id)

    // Atualiza em lotes de 50 para evitar URL muito longa
    for (let i = 0; i < ids.length; i += 50) {
      const { error } = await supabase
        .from('estoque')
        .update({ status: 'disponivel' })
        .in('id', ids.slice(i, i + 50))
      if (error) { showToast('Erro ao fechar conferência.', 'error'); setClosing(false); return }
    }

    try { localStorage.removeItem(COUNTS_KEY); localStorage.removeItem(`nfe_grupo_${grupoId}`) } catch { /* ignore */ }
    router.push('/estoque')
  }

  /* ── Excluir nota ── */

  async function deleteNota() {
    setDeleting(true)
    const { error } = await supabase
      .from('estoque')
      .delete()
      .eq('nfe_grupo_id', grupoId)
      .eq('user_id', user.id)
      .eq('status', 'aguardando_recebimento')
    if (error) {
      showToast('Erro ao excluir a nota fiscal.', 'error')
      setDeleting(false)
      return
    }
    try {
      localStorage.removeItem(COUNTS_KEY)
      localStorage.removeItem(`nfe_grupo_${grupoId}`)
    } catch { /* ignore */ }
    router.push('/estoque/recebimento')
  }

  /* ── Derived ── */

  const totalEsperado = produtos.reduce((s, p) => s + totalQtd(p.tamanhos), 0)
  const totalScanned  = Object.values(counts).reduce((s, n) => s + n, 0)
  const allDone       = totalScanned >= totalEsperado

  const matchedProduto = scanResult?.match_produto_id
    ? produtos.find(p => p.id === scanResult.match_produto_id)
    : null

  const resolvedProduto = selectedProdId
    ? produtos.find(p => p.id === selectedProdId)
    : matchedProduto

  const priceDiffers = scanResult != null
    && scanResult.etiqueta.preco_venda != null
    && scanResult.preco_venda_esperado != null
    && Math.abs(scanResult.etiqueta.preco_venda - scanResult.preco_venda_esperado) > 0.01

  const confiancaColor: Record<ScanResult['confianca'], string> = {
    alta:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    media:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    baixa:   'text-orange-400 bg-orange-500/10 border-orange-500/20',
    nenhuma: 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  const confiancaLabel: Record<ScanResult['confianca'], string> = {
    alta: 'Alta confiança', media: 'Confiança média', baixa: 'Baixa confiança', nenhuma: 'Sem correspondência',
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/estoque/recebimento" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition shrink-0">
              <IconBack />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Conferência de Recebimento</h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                {produtos[0]?.marca ?? 'NF-e'} ·{' '}
                <span className={allDone ? 'text-emerald-400' : 'text-amber-400'}>
                  {totalScanned}/{totalEsperado} itens conferidos
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={closing || deleting}
              title="Excluir nota e produtos"
              className="flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-50 rounded-lg px-4 py-2.5 transition cursor-pointer"
            >
              <IconTrash size={15}/>
              <span className="hidden sm:inline">Excluir nota</span>
            </button>
            <button
              onClick={() => closeConferencia()}
              disabled={closing || deleting}
              className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 rounded-lg px-5 py-2.5 transition cursor-pointer"
            >
              {closing ? <><IconSpinner size={14}/> Fechando...</> : 'Fechar Conferência'}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border ${
            toast.type === 'success'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck /> : <IconX size={14}/>}
            {toast.msg}
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-zinc-400">Progresso da conferência</span>
            <span className={`font-semibold ${allDone ? 'text-emerald-400' : 'text-zinc-300'}`}>
              {totalScanned} / {totalEsperado}
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.min(100, (totalScanned / Math.max(totalEsperado, 1)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── Coluna esquerda: Lista de produtos ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-sm">Produtos da NF-e</h2>
            </div>
            <div className="divide-y divide-zinc-800/60 max-h-[500px] overflow-y-auto">
              {produtos.map(p => {
                const esperado  = totalQtd(p.tamanhos)
                const scanned   = counts[p.id] ?? 0
                const done      = scanned >= esperado
                const over      = scanned > esperado
                return (
                  <div key={p.id} className={`px-5 py-3.5 flex items-center gap-3 transition ${resolvedProduto?.id === p.id ? 'bg-violet-500/5 border-l-2 border-violet-500' : ''}`}>
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold transition ${
                      done ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                           : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                    }`}>
                      {done ? <IconCheck size={12}/> : scanned > 0 ? scanned : '○'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nome}</p>
                      {p.codigo_produto && <p className="text-xs text-zinc-500 font-mono">{p.codigo_produto}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${over ? 'text-amber-400' : done ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        {scanned}/{esperado}
                      </p>
                      {over && <p className="text-xs text-amber-500">excesso</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Coluna direita: Scan e resultado ── */}
          <div className="flex flex-col gap-4">

            {/* Botão de scan */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <input
                ref={scanRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleScanFile}
              />
              <button
                onClick={() => { setScanResult(null); setScanError(''); scanRef.current?.click() }}
                disabled={scanning}
                className="w-full flex items-center gap-3 border border-dashed border-zinc-700 hover:border-violet-500/60 bg-zinc-800/30 hover:bg-violet-500/5 rounded-xl px-5 py-5 transition group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-800 group-hover:bg-violet-500/10 border border-zinc-700 group-hover:border-violet-500/30 flex items-center justify-center shrink-0 transition text-zinc-400 group-hover:text-violet-300">
                  {scanning ? <IconSpinner size={20}/> : <IconCamera />}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-zinc-200 group-hover:text-white transition text-sm">
                    {scanning ? 'Analisando etiqueta...' : 'Escanear etiqueta'}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">Tire uma foto da etiqueta do produto recebido</p>
                </div>
                <div className="ml-auto shrink-0">
                  <span className="text-xs text-violet-500 font-semibold px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-md">IA</span>
                </div>
              </button>
            </div>

            {/* Erro de scan */}
            {scanError && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <IconX size={14}/>{scanError}
              </div>
            )}

            {/* Resultado do scan */}
            {scanResult && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Resultado da análise</h3>
                  <button onClick={() => { setScanResult(null); setScanError('') }} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer">
                    <IconX size={14}/>
                  </button>
                </div>

                <div className="p-5 flex flex-col gap-4">

                  {/* Etiqueta lida */}
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Etiqueta lida</p>
                    <p className="font-semibold">{scanResult.etiqueta.nome ?? 'Nome não identificado'}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {scanResult.etiqueta.marca        && <span className="text-xs text-zinc-400 bg-zinc-700 px-2 py-0.5 rounded">{scanResult.etiqueta.marca}</span>}
                      {scanResult.etiqueta.tamanho      && <span className="text-xs text-zinc-400 bg-zinc-700 px-2 py-0.5 rounded">{scanResult.etiqueta.tamanho}</span>}
                      {scanResult.etiqueta.cor          && <span className="text-xs text-zinc-400 bg-zinc-700 px-2 py-0.5 rounded">{scanResult.etiqueta.cor}</span>}
                      {scanResult.etiqueta.codigo_produto && <span className="text-xs text-zinc-500 font-mono bg-zinc-700 px-2 py-0.5 rounded">{scanResult.etiqueta.codigo_produto}</span>}
                    </div>
                  </div>

                  {/* Match */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Produto na nota</p>
                      {scanResult.confianca !== 'nenhuma' && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${confiancaColor[scanResult.confianca]}`}>
                          {confiancaLabel[scanResult.confianca]}
                        </span>
                      )}
                    </div>

                    {/* Seleção manual */}
                    <select
                      value={selectedProdId || scanResult.match_produto_id || ''}
                      onChange={e => setSelectedProdId(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-violet-500 cursor-pointer [color-scheme:dark]"
                    >
                      <option value="">— Selecionar produto da nota —</option>
                      {produtos.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nome}{p.codigo_produto ? ` (${p.codigo_produto})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Divergências */}
                  {scanResult.divergencias.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Divergências detectadas</p>
                      {scanResult.divergencias.map((d, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                          <IconWarning size={14} />
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comparação de preço */}
                  {priceDiffers && priceDecision === 'pending' && (
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                      <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-3">Preço diferente detectado</p>
                      <div className="flex items-center justify-between text-sm mb-3">
                        <div>
                          <p className="text-zinc-500 text-xs">Na etiqueta</p>
                          <p className="font-bold text-white text-base">{fBRL(scanResult.etiqueta.preco_venda)}</p>
                        </div>
                        <div className="text-zinc-700">→</div>
                        <div className="text-right">
                          <p className="text-zinc-500 text-xs">Calculado pelo markup</p>
                          <p className="font-bold text-zinc-400 text-base">{fBRL(scanResult.preco_venda_esperado)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">
                        Deseja atualizar o preço de venda para <strong className="text-white">{fBRL(scanResult.etiqueta.preco_venda)}</strong>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPriceDecision('accepted')}
                          className="flex-1 text-xs font-semibold bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-400 rounded-lg py-2 transition cursor-pointer"
                        >
                          Sim, atualizar
                        </button>
                        <button
                          onClick={() => setPriceDecision('ignored')}
                          className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg py-2 transition cursor-pointer"
                        >
                          Não, manter
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decision made */}
                  {priceDiffers && priceDecision === 'accepted' && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <IconCheck size={14}/>
                      Preço será atualizado para {fBRL(scanResult.etiqueta.preco_venda)} ao confirmar
                    </div>
                  )}
                  {priceDiffers && priceDecision === 'ignored' && (
                    <div className="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2">
                      Preço mantido em {fBRL(scanResult.preco_venda_esperado)}
                    </div>
                  )}

                  {/* Confirm / cancel */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => { setScanResult(null); setScanError('') }}
                      className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2.5 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmScan}
                      disabled={priceDiffers && priceDecision === 'pending' || !resolvedProduto}
                      className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                    >
                      <IconCheck size={15}/>
                      Confirmar scan
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Placeholder quando sem scan */}
            {!scanResult && !scanning && !scanError && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600">
                  <IconCamera size={22}/>
                </div>
                <p className="text-sm text-zinc-500">Escaneie uma etiqueta para verificar o produto recebido</p>
              </div>
            )}

          </div>
        </div>

      </main>

      {/* ── Modal de confirmação de exclusão ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center text-red-400 shrink-0">
                <IconTrash size={18}/>
              </div>
              <div>
                <h3 className="font-bold">Excluir nota fiscal?</h3>
                <p className="text-zinc-500 text-sm">{produtos.length} produto{produtos.length !== 1 ? 's' : ''} serão removidos do estoque</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-5">
              Todos os produtos importados desta NF-e que ainda estão aguardando conferência serão <strong className="text-red-400">permanentemente excluídos</strong> do estoque. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg py-2.5 transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); deleteNota() }}
                disabled={deleting}
                className="flex-1 text-sm font-semibold bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg py-2.5 transition cursor-pointer disabled:opacity-50"
              >
                {deleting ? <><IconSpinner size={13}/> Excluindo...</> : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de confirmação de fechamento ── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                <IconWarning size={18}/>
              </div>
              <div>
                <h3 className="font-bold">Conferência incompleta</h3>
                <p className="text-zinc-500 text-sm">{totalScanned} de {totalEsperado} itens conferidos</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-5">
              Ainda há itens não conferidos. Fechar agora marcará todos os produtos como disponíveis, independentemente da conferência.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg py-2.5 transition cursor-pointer"
              >
                Continuar conferindo
              </button>
              <button
                onClick={() => { setShowCloseConfirm(false); closeConferencia(true) }}
                disabled={closing}
                className="flex-1 text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 rounded-lg py-2.5 transition cursor-pointer disabled:opacity-50"
              >
                {closing ? 'Fechando...' : 'Fechar mesmo assim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
