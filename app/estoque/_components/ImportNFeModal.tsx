'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Produto, TamanhoQtd, NfeGrupoMeta } from '../types'
import { imageToBase64, fileToBase64Raw } from '../_utils/imageUtils'

/* ── Types ── */

type NFeItem = {
  key: string
  selected: boolean
  nome: string
  codigo_produto: string | null
  ncm: string | null
  cfop: string | null
  icms: string | null
  pis: string | null
  cofins: string | null
  cest: string | null
  qtd: number
  preco_custo: number | null
  preco_venda: number | null
  categoria: Produto['categoria']
  marca: string | null
}

/* ── NF-e XML parsing (client-side, sem API) ── */

function getEl(parent: Element | Document, tag: string): Element | null {
  return (parent as Element).getElementsByTagNameNS?.('*', tag)?.[0]
      ?? (parent as Element).getElementsByTagName?.(tag)?.[0]
      ?? null
}

function getVal(parent: Element | Document | null, tag: string): string | null {
  if (!parent) return null
  return getEl(parent as Element | Document, tag)?.textContent?.trim() || null
}

function extractICMS(icmsGroup: Element | null): string | null {
  if (!icmsGroup) return null
  for (const v of ['ICMS00','ICMS10','ICMS20','ICMS30','ICMS40','ICMS41','ICMS50','ICMS51','ICMS60','ICMS70','ICMS90','ICMSSN101','ICMSSN102','ICMSSN201','ICMSSN202','ICMSSN500','ICMSSN900']) {
    const node = getEl(icmsGroup, v)
    if (!node) continue
    const p = getVal(node, 'pICMS')
    const cst = getVal(node, 'CST') ?? getVal(node, 'CSOSN')
    if (p) return cst ? `CST ${cst} / ${p}%` : `${p}%`
    if (cst) return `CST ${cst}`
  }
  return null
}

function extractTax(group: Element | null, variants: string[], rateTag: string): string | null {
  if (!group) return null
  for (const v of variants) {
    const node = getEl(group, v)
    if (!node) continue
    const rate = getVal(node, rateTag)
    const cst  = getVal(node, 'CST')
    if (rate) return cst ? `CST ${cst} / ${rate}%` : `${rate}%`
    if (cst)  return `CST ${cst}`
  }
  return null
}

function inferCategoria(nome: string): Produto['categoria'] {
  const n = nome.toUpperCase()
  if (/CAMISETA|(?<![A-Z])CAMISA(?![A-Z])|(?<![A-Z])POLO(?![A-Z])|T[-\s]?SHIRT/.test(n)) return 'camiseta'
  if (/(?<![A-Z])REGATA(?![A-Z])/.test(n))                                                  return 'regata'
  if (/CALCA|CAL[CÇ]A|BERMUDA|SHORT|JEANS|SARJA|JOGGER|MOLETOM/.test(n))                   return 'calca'
  if (/TENIS|T[EÊ]NIS|SAPATENIS|(?<![A-Z])BOTA(?![A-Z])|SANDAL|CHINELO/.test(n))           return 'tenis'
  return 'outros'
}

type ParsedNFe = {
  emitente: string | null
  num_nfe: string | null
  items: Omit<NFeItem, 'key' | 'selected' | 'categoria' | 'marca' | 'preco_venda'>[]
}

function parseXML(xml: string): ParsedNFe | { error: string } {
  let doc: Document
  try { doc = new DOMParser().parseFromString(xml, 'text/xml') }
  catch { return { error: 'Arquivo XML inválido.' } }

  if (doc.getElementsByTagName('parsererror')[0]) {
    return { error: 'Arquivo XML com estrutura inválida.' }
  }

  const emitEl    = getEl(doc, 'emit')
  const emitente  = getVal(emitEl, 'xFant') || getVal(emitEl, 'xNome')
  const ideEl     = getEl(doc, 'ide')
  const num_nfe   = getVal(ideEl, 'nNF')

  const detEls = Array.from(
    doc.getElementsByTagNameNS('*', 'det').length
      ? doc.getElementsByTagNameNS('*', 'det')
      : doc.getElementsByTagName('det')
  )
  if (!detEls.length) return { error: 'Nenhum item encontrado na NF-e. Verifique se é um arquivo NF-e válido.' }

  const items = detEls.map(det => {
    const prod   = getEl(det, 'prod')
    const imp    = getEl(det, 'imposto')
    const vUnCom = getVal(prod, 'vUnCom')
    const qCom   = getVal(prod, 'qCom')

    return {
      nome:           getVal(prod, 'xProd') ?? 'Produto sem nome',
      codigo_produto: getVal(prod, 'cProd'),
      ncm:            getVal(prod, 'NCM'),
      cfop:           getVal(prod, 'CFOP'),
      cest:           getVal(prod, 'CEST'),
      icms:   extractICMS(imp ? getEl(imp, 'ICMS') : null),
      pis:    extractTax(imp ? getEl(imp, 'PIS') : null,    ['PISAliq','PISNT','PISST','PISOutr'],       'pPIS'),
      cofins: extractTax(imp ? getEl(imp, 'COFINS') : null, ['COFINSAliq','COFINSNT','COFINSST','COFINSOutr'], 'pCOFINS'),
      qtd:         qCom   ? Math.max(1, Math.round(parseFloat(qCom))) : 1,
      preco_custo: vUnCom ? parseFloat(parseFloat(vUnCom).toFixed(2)) : null,
    }
  })

  return { emitente, num_nfe, items }
}

/* ── Helpers ── */

const CAT_LABEL: Record<Produto['categoria'], string> = {
  camiseta: 'Camiseta', regata: 'Regata', calca: 'Calça', tenis: 'Tênis', outros: 'Outros',
}

function fBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function isImage(name: string) {
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(name)
}
function isPDF(name: string) {
  return /\.pdf$/i.test(name)
}

/* ── Icons ── */

const IconX = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 18 4 13"/>
  </svg>
)
const IconSpinner = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)
const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

/* ── Component ── */

export default function ImportNFeModal({
  userId,
  onSuccess,
  onClose,
}: {
  userId: string
  onSuccess: (produtos: Produto[], grupoId: string) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [step,       setStep]       = useState<'upload' | 'preview'>('upload')
  const [parsing,    setParsing]    = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [error,      setError]      = useState('')
  const [emitente,   setEmitente]   = useState<string | null>(null)
  const [numNfe,     setNumNfe]     = useState<string | null>(null)
  const [markupUsed, setMarkupUsed] = useState<number | null>(null)
  const [items,      setItems]      = useState<NFeItem[]>([])

  async function resolveNFe(file: File): Promise<ParsedNFe | { error: string }> {
    if (isImage(file.name)) {
      const base64 = await imageToBase64(file)
      const ext    = file.name.split('.').pop()?.toLowerCase()
      const mt     = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const res    = await fetch('/api/import-nfe-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, mediaType: mt }),
      })
      if (!res.ok) return { error: `Erro ao processar imagem (${res.status})` }
      const data = await res.json()
      if (data.error) return { error: data.error }
      return { emitente: data.emitente ?? null, num_nfe: data.num_nfe ?? null, items: data.items ?? [] }
    }

    if (isPDF(file.name)) {
      const base64 = await fileToBase64Raw(file)
      const res    = await fetch('/api/import-nfe-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, mediaType: 'application/pdf' }),
      })
      if (!res.ok) return { error: `Erro ao processar PDF (${res.status})` }
      const data = await res.json()
      if (data.error) return { error: data.error }
      return { emitente: data.emitente ?? null, num_nfe: data.num_nfe ?? null, items: data.items ?? [] }
    }

    // XML: parseia no cliente sem chamar API
    return parseXML(await file.text())
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const accepted = isImage(file.name) || isPDF(file.name) || file.name.toLowerCase().endsWith('.xml')
    if (!accepted) { setError('Formatos aceitos: XML, JPG, PNG, PDF'); return }

    setParsing(true); setError('')

    try {
      const result = await resolveNFe(file)
      if ('error' in result) { setError(result.error); return }

      const { emitente: emit, num_nfe, items: rawItems } = result
      if (!rawItems.length) { setError('Nenhum produto encontrado no documento.'); return }

      // Busca markup pela marca/emitente
      let markup: number | null = null
      const { data: marcas } = await supabase.from('marcas').select('nome, markup')
      if (marcas && emit) {
        const emitLow = emit.toLowerCase()
        const match   = marcas.find(m => {
          const mLow = m.nome.toLowerCase()
          return emitLow.includes(mLow) || mLow.includes(emitLow)
        })
        if (match && match.markup > 0) markup = match.markup
      }

      const nfeItems: NFeItem[] = rawItems.map((raw, i) => ({
        ...raw,
        key:       String(i),
        selected:  true,
        categoria: inferCategoria(raw.nome),
        marca:     emit,
        preco_venda: markup && raw.preco_custo != null
          ? parseFloat((raw.preco_custo * markup).toFixed(2))
          : null,
      }))

      setEmitente(emit)
      setNumNfe(num_nfe ?? null)
      setMarkupUsed(markup)
      setItems(nfeItems)
      setStep('preview')
    } catch {
      setError('Erro ao processar o arquivo. Tente novamente.')
    } finally {
      setParsing(false)
    }
  }

  function updateItem<K extends keyof NFeItem>(key: string, field: K, value: NFeItem[K]) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it))
  }

  async function handleImport() {
    const selected = items.filter(i => i.selected)
    if (!selected.length) { setError('Selecione ao menos um produto.'); return }

    setImporting(true); setError('')

    const grupoId = crypto.randomUUID()

    const inserts = selected.map(item => ({
      user_id:        userId,
      nome:           item.nome,
      marca:          item.marca,
      codigo_produto: item.codigo_produto,
      cor:            null,
      categoria:      item.categoria,
      tamanhos:       [{ tamanho: 'UN', qtd: item.qtd }] as TamanhoQtd[],
      preco_custo:    item.preco_custo,
      preco_venda:    item.preco_venda,
      ncm:            item.ncm,
      cfop:           item.cfop,
      icms:           item.icms,
      pis:            item.pis,
      cofins:         item.cofins,
      cest:           item.cest,
      status:         'aguardando_recebimento' as const,
      nfe_grupo_id:   grupoId,
    }))

    const { data, error: err } = await supabase.from('estoque').insert(inserts).select()
    if (err) { setError(err.message); setImporting(false); return }
    if (!data || data.length === 0) {
      setError('Nenhum produto foi salvo. Verifique sua conexão e tente novamente.')
      setImporting(false)
      return
    }

    // Salva metadados do grupo no localStorage para uso na tela de recebimento
    const meta: NfeGrupoMeta = {
      grupoId,
      emitente,
      num_nfe: numNfe,
      total_itens: selected.length,
      data: new Date().toISOString(),
    }
    try { localStorage.setItem(`nfe_grupo_${grupoId}`, JSON.stringify(meta)) } catch { /* ignorar */ }

    onSuccess(data ?? [], grupoId)
  }

  const selectedCount = items.filter(i => i.selected).length
  const allSelected   = items.length > 0 && selectedCount === items.length

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between p-6 border-b border-zinc-800 shrink-0">
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">Importar NF-e</h2>
                {step === 'preview' && (
                  <p className="text-sm text-zinc-500 mt-0.5 truncate">
                    {emitente && <span className="text-zinc-300">{emitente}</span>}
                    {numNfe   && <span className="text-zinc-500"> · NF {numNfe}</span>}
                    {emitente && ' · '}
                    {items.length} produto{items.length !== 1 ? 's' : ''} encontrado{items.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            {step === 'preview' && markupUsed && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <IconCheck size={14}/>
                Markup {markupUsed}× aplicado — preço de venda = custo × {markupUsed}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer shrink-0 ml-4">
            <IconX />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {step === 'upload' ? (
            <div className="p-8 flex flex-col items-center gap-6">
              <input ref={fileRef} type="file" accept=".xml,.jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                className="w-full max-w-md border-2 border-dashed border-zinc-700 hover:border-indigo-500/60 bg-zinc-800/30 hover:bg-indigo-500/5 rounded-2xl p-12 flex flex-col items-center gap-4 transition group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 group-hover:bg-indigo-500/10 border border-zinc-700 group-hover:border-indigo-500/30 flex items-center justify-center text-zinc-400 group-hover:text-indigo-300 transition">
                  {parsing ? <IconSpinner /> : <IconUpload />}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-zinc-200 group-hover:text-white transition">
                    {parsing ? 'Processando documento...' : 'Selecionar arquivo'}
                  </p>
                  <p className="text-sm text-zinc-600 mt-1">XML · Foto da NF-e (JPG/PNG) · PDF</p>
                </div>
                <span className="text-xs text-indigo-400 font-semibold px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">NF-e</span>
              </button>
              <div className="text-center text-xs text-zinc-600 space-y-1 max-w-sm">
                <p>Extrai automaticamente: nome, código, NCM, CFOP, ICMS, PIS, COFINS, CEST, quantidade e preço de custo</p>
                <p>Foto ou PDF processados pela IA · Se o emitente tiver markup cadastrado, o preço de venda é calculado</p>
                <p className="text-zinc-700 font-medium">Produtos ficam com status "Aguardando recebimento" até a conferência</p>
              </div>
            </div>

          ) : (
            <div className="flex flex-col">
              <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-3 shrink-0">
                <input
                  type="checkbox" checked={allSelected}
                  onChange={e => setItems(prev => prev.map(i => ({ ...i, selected: e.target.checked })))}
                  className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
                />
                <span className="text-sm text-zinc-400">
                  {selectedCount === items.length ? 'Todos selecionados' : `${selectedCount} de ${items.length} selecionado${selectedCount !== 1 ? 's' : ''}`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="w-10 px-4 py-2.5"/>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Nome</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Categoria</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Código</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Qtd</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Custo</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-2.5">Venda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {items.map(item => (
                      <tr key={item.key} className={`transition ${item.selected ? 'hover:bg-white/[0.02]' : 'opacity-35'}`}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={item.selected}
                            onChange={e => updateItem(item.key, 'selected', e.target.checked)}
                            className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2.5 max-w-[240px]">
                          <p className="font-medium truncate" title={item.nome}>{item.nome}</p>
                          {item.marca && <p className="text-xs text-zinc-500 truncate">{item.marca}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <select value={item.categoria}
                            onChange={e => updateItem(item.key, 'categoria', e.target.value as Produto['categoria'])}
                            className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-500 cursor-pointer [color-scheme:dark]"
                          >
                            {(Object.keys(CAT_LABEL) as Produto['categoria'][]).map(cat => (
                              <option key={cat} value={cat}>{CAT_LABEL[cat]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs whitespace-nowrap">{item.codigo_produto ?? '—'}</td>
                        <td className="px-4 py-2.5 text-zinc-300">{item.qtd}</td>
                        <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{fBRL(item.preco_custo)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {item.preco_venda != null
                            ? <span className="text-emerald-400 font-medium">{fBRL(item.preco_venda)}</span>
                            : <span className="text-zinc-600 text-xs">sem markup</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-3 border-t border-zinc-800 text-xs text-zinc-600 space-y-1">
                <p>Dados fiscais (NCM, CFOP, ICMS, PIS, COFINS, CEST) importados automaticamente.</p>
                <p>Produtos ficam com status <span className="text-amber-500/80">Aguardando recebimento</span> até a conferência de mercadoria.</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 shrink-0">
            <IconX size={14}/>{error}
          </div>
        )}

        {step === 'preview' && (
          <div className="flex items-center justify-between p-6 border-t border-zinc-800 shrink-0 gap-4">
            <button
              onClick={() => { setStep('upload'); setItems([]); setError('') }}
              className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2.5 transition cursor-pointer"
            >
              Voltar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selectedCount === 0}
              className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-6 py-2.5 transition cursor-pointer"
            >
              {importing
                ? <><IconSpinner /> Importando...</>
                : `Importar ${selectedCount} Produto${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
