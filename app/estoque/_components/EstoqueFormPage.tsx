'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function applyParamsToForm(base: FormState, sp: Record<string, string | undefined>): FormState {
  const next = { ...base }
  if (sp.nome)     next.nome  = sp.nome
  if (sp.marca)    next.marca = sp.marca
  const cat = sp.categoria as Produto['categoria'] | undefined
  if (cat && ['camiseta','regata','calca','bermuda','polo','tenis','chinelo','outros'].includes(cat)) {
    next.categoria  = cat
    next.tamanhos   = []
    next.qtd_outros = '0'
    if (sp.tamanho && cat !== 'outros' && SIZE_OPTIONS[cat].includes(sp.tamanho))
      next.tamanhos = [{ tamanho: sp.tamanho, qtd: 1 }]
  }
  if (sp.preco_venda)    next.preco_venda    = sp.preco_venda
  if (sp.preco_custo)    next.preco_custo    = sp.preco_custo
  if (sp.codigo_produto) next.codigo_produto = sp.codigo_produto
  if (sp.cor)            next.cor            = sp.cor
  return next
}
import { createClient } from '@/lib/supabase/client'
import type { Produto, TamanhoQtd } from '../types'

/* ── Types ── */

type FormState = {
  nome: string
  marca: string
  codigo_produto: string
  cor: string
  genero: 'M' | 'F' | 'U' | 'I' | ''
  categoria: Produto['categoria'] | ''
  tamanhos: TamanhoQtd[]
  qtd_outros: string
  preco_custo: string
  preco_venda: string
  ncm: string
  cfop: string
  icms: string
  pis: string
  cofins: string
  cest: string
}


/* ── Constants ── */

const SIZE_OPTIONS: Record<Produto['categoria'], string[]> = {
  camiseta: ['P', 'M', 'G', 'GG', 'XGG'],
  regata:   ['P', 'M', 'G', 'GG', 'XGG'],
  calca:    ['38', '40', '42', '44', '46', '48', '50'],
  bermuda:  ['P', 'M', 'G', 'GG', 'XGG'],
  polo:     ['P', 'M', 'G', 'GG', 'XGG'],
  tenis:    ['37', '38', '39', '40', '41', '42', '43', '44'],
  chinelo:  ['37/38', '39/40', '41/42', '43/44'],
  outros:   [],
}

const CAT_LABEL: Record<Produto['categoria'], string> = {
  camiseta: 'Camiseta',
  regata:   'Regata',
  calca:    'Calça',
  bermuda:  'Bermuda',
  polo:     'Polo',
  tenis:    'Tênis',
  chinelo:  'Chinelos',
  outros:   'Outros',
}

const CAT_COLOR: Record<Produto['categoria'], string> = {
  camiseta: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  regata:   'bg-rose-500/15 text-rose-300 border-rose-500/25',
  calca:    'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bermuda:  'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  polo:     'bg-sky-500/15 text-sky-300 border-sky-500/25',
  tenis:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  chinelo:  'bg-amber-500/15 text-amber-300 border-amber-500/25',
  outros:   'bg-zinc-700/50 text-zinc-300 border-zinc-600',
}

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]'

/* ── Helpers ── */

function calcMargem(custo: number | null, venda: number | null) {
  if (!custo || !venda || custo === 0) return null
  return ((venda - custo) / custo * 100).toFixed(0)
}

function totalQtd(tamanhos: TamanhoQtd[]) {
  return tamanhos.reduce((s, t) => s + t.qtd, 0)
}

const EMPTY_TRIBUTOS = { ncm: '', cfop: '', icms: '', pis: '', cofins: '', cest: '' }

function toFormState(p?: Produto): FormState {
  if (!p) return { nome: '', marca: '', codigo_produto: '', cor: '', genero: '', categoria: '', tamanhos: [], qtd_outros: '0', preco_custo: '', preco_venda: '', ...EMPTY_TRIBUTOS }
  return {
    nome: p.nome,
    marca: p.marca ?? '',
    codigo_produto: p.codigo_produto ?? '',
    cor: p.cor ?? '',
    genero: (p.genero as FormState['genero']) ?? '',
    categoria: p.categoria,
    tamanhos: p.categoria !== 'outros' ? (p.tamanhos ?? []) : [],
    qtd_outros: p.categoria === 'outros' ? String(p.tamanhos.reduce((s, t) => s + t.qtd, 0)) : '0',
    preco_custo: p.preco_custo != null ? String(p.preco_custo) : '',
    preco_venda: p.preco_venda != null ? String(p.preco_venda) : '',
    ncm: p.ncm ?? '',
    cfop: p.cfop ?? '',
    icms: p.icms ?? '',
    pis: p.pis ?? '',
    cofins: p.cofins ?? '',
    cest: p.cest ?? '',
  }
}

/* ── Photo helpers ── */

const SIZES_LIST = ['PLUS','EXTRA','XGG','GG','PP','XS','XL','XXL','XXXL','P','M','G','S','L','U','60','58','56','54','52','50','48','46','44','42','40','38','36','34','32']

function extractModeloLocal(nome: string): string {
  const upper = nome.toUpperCase().trim()
  for (const t of SIZES_LIST) {
    if (upper.endsWith(' ' + t)) return nome.slice(0, nome.length - t.length - 1).trim()
  }
  return nome
}

async function compressImageLocal(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = document.createElement('img')
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => resolve(b ?? file), 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  })
}

/* ── Sub-components ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

/* ── Icons ── */

const IconX       = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck   = ({ size = 14 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconBack    = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
const IconCamera  = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IconScan    = ({ size = 13 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
const IconSpinner = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>

/* ── Main component ── */

export default function EstoqueFormPage({
  user,
  produto,
  scanParams,
}: {
  user: { id: string; email: string }
  produto?: Produto
  scanParams?: Record<string, string | undefined>
}) {
  const router = useRouter()
  const supabase = createClient()

  const hasScanParams = !!(scanParams?.nome || scanParams?.categoria || scanParams?.preco_venda)
  const [form, setForm] = useState<FormState>(() =>
    hasScanParams ? applyParamsToForm(toFormState(produto), scanParams!) : toFormState(produto)
  )
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'loading' } | null>(null)
  const [activeTab, setActiveTab] = useState<'principal' | 'tributos'>('principal')
  const [marcasMap, setMarcasMap] = useState<Map<string, number>>(new Map())
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoId, setFotoId] = useState<string | null>(null)
  const [fotoStoragePath, setFotoStoragePath] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const photoInputRef   = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('marcas').select('nome, markup').then(({ data }) => {
      if (data) setMarcasMap(new Map(data.map(m => [m.nome.toLowerCase().trim(), m.markup])))
    })
    if (hasScanParams) showToast('Etiqueta escaneada com sucesso!')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!produto) return
    supabase
      .from('biblioteca_fotos')
      .select('id, url, storage_path')
      .contains('estoque_ids', [produto.id])
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          setFotoUrl(data[0].url)
          setFotoId(data[0].id)
          setFotoStoragePath(data[0].storage_path)
        }
      })
  }, [produto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePhotoUpload(file: File) {
    if (!produto) return
    setPhotoLoading(true)
    try {
      const compressed = await compressImageLocal(file)
      const path = `${user.id}/${Date.now()}.jpg`

      if (fotoStoragePath) await supabase.storage.from('biblioteca').remove([fotoStoragePath])

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('biblioteca')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage.from('biblioteca').getPublicUrl(uploadData.path)

      const modelo = extractModeloLocal(produto.nome)
      const { data: allEstoque } = await supabase.from('estoque').select('id, nome').eq('user_id', user.id)
      const variantIds = (allEstoque ?? [])
        .filter(v => extractModeloLocal(v.nome).toLowerCase() === modelo.toLowerCase())
        .map(v => v.id)
      if (!variantIds.includes(produto.id)) variantIds.push(produto.id)

      if (fotoId) {
        await supabase.from('biblioteca_fotos')
          .update({ url: publicUrl, storage_path: path, estoque_ids: variantIds })
          .eq('id', fotoId)
      } else {
        const { data: newFoto } = await supabase.from('biblioteca_fotos').insert({
          user_id: user.id,
          url: publicUrl,
          storage_path: path,
          modelo,
          marca: produto.marca,
          estoque_ids: variantIds,
        }).select('id').maybeSingle()
        if (newFoto) setFotoId(newFoto.id)
      }

      setFotoUrl(publicUrl)
      setFotoStoragePath(path)
      showToast(`Foto vinculada a ${variantIds.length} produto(s)!`)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro ao salvar foto', 'error')
    }
    setPhotoLoading(false)
  }

  function calcCusto(marca: string, venda: string): string {
    const markup = marcasMap.get(marca.toLowerCase().trim())
    const vendaNum = parseFloat(venda)
    if (!markup || markup <= 0 || !venda || isNaN(vendaNum)) return ''
    return String(parseFloat((vendaNum / markup).toFixed(2)))
  }

  const sizeOptions = form.categoria
    ? (SIZE_OPTIONS[form.categoria as Produto['categoria']] ?? [])
    : []

  /* ── Helpers ── */

  function showToast(msg: string, type: 'success' | 'error' | 'loading' = 'success') {
    setToast({ msg, type })
    if (type !== 'loading') setTimeout(() => setToast(null), 4000)
  }


  function toggleTamanho(tamanho: string) {
    setForm(f => {
      const exists = f.tamanhos.find(t => t.tamanho === tamanho)
      return {
        ...f,
        tamanhos: exists
          ? f.tamanhos.filter(t => t.tamanho !== tamanho)
          : [...f.tamanhos, { tamanho, qtd: 1 }],
      }
    })
  }

  function setTamanhoQtd(tamanho: string, qtd: number) {
    setForm(f => ({
      ...f,
      tamanhos: f.tamanhos.map(t => t.tamanho === tamanho ? { ...t, qtd: Math.max(0, qtd) } : t),
    }))
  }

  function handleCategoriaChange(cat: Produto['categoria'] | '') {
    setForm(f => ({ ...f, categoria: cat, tamanhos: [], qtd_outros: '0' }))
  }


  async function handleScanImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setScanning(true)
    try {
      const base64 = await resizeToBase64(file)
      const res = await fetch('/api/scan-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setForm(f => applyParamsToForm(f, {
        nome:           data.nome           ?? undefined,
        marca:          data.marca          ?? undefined,
        categoria:      data.categoria      ?? undefined,
        tamanho:        data.tamanho        ?? undefined,
        preco_venda:    data.preco_venda    != null ? String(data.preco_venda) : undefined,
        preco_custo:    data.preco_custo    != null ? String(data.preco_custo) : undefined,
        codigo_produto: data.codigo_produto ?? undefined,
        cor:            data.cor            ?? undefined,
      }))
      showToast('Etiqueta escaneada com sucesso!')
    } catch {
      showToast('Erro ao escanear etiqueta', 'error')
    } finally {
      setScanning(false)
    }
  }

  async function resizeToBase64(file: File): Promise<string> {
    const MAX = 1600
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível')

    if (typeof createImageBitmap !== 'undefined') {
      // createImageBitmap: decodifica sem copiar o arquivo para memória como string.
      // Suporta HEIC no iOS 15+ e é mais confiável que Image+FileReader.
      const bitmap = await createImageBitmap(file)
      let { width, height } = bitmap
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
        else                 { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width
      canvas.height = height
      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close()
    } else {
      // Fallback para iOS 14 e anteriores: createObjectURL evita duplicar o
      // arquivo em memória (ao contrário de FileReader.readAsDataURL).
      await new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')) }
        img.onload = () => {
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
            else                 { width = Math.round(width * MAX / height); height = MAX }
          }
          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          URL.revokeObjectURL(url)
          resolve()
        }
        img.src = url
      })
    }

    const result = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    if (!result) throw new Error('Conversão falhou')
    return result
  }

  async function handleSave() {
    if (!form.nome.trim()) { setFormError('Nome é obrigatório.'); return }
    if (!form.categoria)   { setFormError('Selecione uma categoria.'); return }
    setSaving(true); setFormError('')

    const tamanhosFinal: TamanhoQtd[] = form.categoria === 'outros'
      ? [{ tamanho: 'UN', qtd: Number(form.qtd_outros) || 0 }]
      : form.tamanhos

    const payload = {
      nome: form.nome.trim(),
      marca: form.marca.trim() || null,
      codigo_produto: form.codigo_produto.trim() || null,
      cor: form.cor.trim() || null,
      genero: form.genero || null,
      categoria: form.categoria,
      tamanhos: tamanhosFinal,
      preco_custo: form.preco_custo ? Number(form.preco_custo) : null,
      preco_venda: form.preco_venda ? Number(form.preco_venda) : null,
      ncm: form.ncm.trim() || null,
      cfop: form.cfop.trim() || null,
      icms: form.icms.trim() || null,
      pis: form.pis.trim() || null,
      cofins: form.cofins.trim() || null,
      cest: form.cest.trim() || null,
    }

    const { error } = produto
      ? await supabase.from('estoque').update(payload).eq('id', produto.id)
      : await supabase.from('estoque').insert({ ...payload, user_id: user.id })

    if (error) { setFormError(error.message); setSaving(false); return }
    router.push('/estoque')
  }

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <main className="max-w-lg mx-auto px-6 py-8">

        {/* Back + title */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/estoque" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">
            <IconBack />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{produto ? 'Editar Produto' : 'Novo Produto'}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{produto ? produto.nome : 'Preencha os dados do produto'}</p>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border ${
            toast.type === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : toast.type === 'loading' ? 'text-violet-300 bg-violet-500/10 border-violet-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck size={15}/> : toast.type === 'loading' ? <IconSpinner /> : <IconX size={15}/>}
            {toast.msg}
          </div>
        )}

        <div className="flex flex-col gap-5">

          {/* Scan */}
          <div>
            <input
              id="scan-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScanImage}
            />
            <label
              htmlFor="scan-input"
              className="w-full flex items-center gap-3 border border-dashed border-zinc-700 hover:border-violet-500/60 bg-zinc-800/30 hover:bg-violet-500/5 rounded-xl px-4 py-4 transition group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-800 group-hover:bg-violet-500/10 border border-zinc-700 group-hover:border-violet-500/30 flex items-center justify-center shrink-0 transition">
                <IconCamera />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition">Escanear etiqueta com IA</p>
                <p className="text-xs text-zinc-600 mt-0.5">Tire uma foto ou envie uma imagem para preencher o formulário</p>
              </div>
              <div className="ml-auto shrink-0">
                <span className="text-xs text-violet-500 font-semibold px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-md">IA</span>
              </div>
            </label>
          </div>

          {/* Foto do produto */}
          {produto && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-300">Foto do produto</label>
                {fotoUrl && <span className="text-xs text-zinc-600">Salva na Biblioteca</span>}
              </div>

              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = '' }} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = '' }} />

              {fotoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl} alt={produto.nome} className="w-full max-h-56 object-cover rounded-2xl bg-zinc-800" />
                  {photoLoading && (
                    <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
                      <div className="flex items-center gap-2 text-white text-sm"><IconSpinner /> Salvando...</div>
                    </div>
                  )}
                  <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
                    <button onClick={() => photoInputRef.current?.click()} className="bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm cursor-pointer hover:bg-black/90 transition">Câmera</button>
                    <button onClick={() => galleryInputRef.current?.click()} className="bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm cursor-pointer hover:bg-black/90 transition">Galeria</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoLoading}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-7 bg-zinc-800/50 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 rounded-2xl transition cursor-pointer text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
                    <IconCamera size={26} />
                    <span className="text-xs font-medium">Câmera</span>
                  </button>
                  <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={photoLoading}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-7 bg-zinc-800/50 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 rounded-2xl transition cursor-pointer text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-xs font-medium">Galeria</span>
                  </button>
                </div>
              )}
              {!fotoUrl && <p className="text-xs text-zinc-600 text-center">Vinculada automaticamente a todas as variações do modelo</p>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-zinc-800/60 border border-zinc-700/60 rounded-xl">
            {(['principal', 'tributos'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition cursor-pointer ${
                  activeTab === tab
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab === 'principal' ? 'Principal' : 'Tributos'}
              </button>
            ))}
          </div>

          {/* ── Tab: Principal ── */}
          {activeTab === 'principal' && (
            <>
              {/* Nome + Marca */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nome *">
                  <input type="text" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="Nome do produto" className={INPUT} />
                </Field>
                <Field label="Marca">
                  <input type="text" value={form.marca} onChange={e => setForm(f => {
                    const custo = calcCusto(e.target.value, f.preco_venda)
                    return { ...f, marca: e.target.value, ...(custo && { preco_custo: custo }) }
                  })} placeholder="Nike, Adidas..." className={INPUT} />
                </Field>
              </div>

              {/* Código do produto + Cor */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Código do produto">
                  <input type="text" value={form.codigo_produto} onChange={e => setForm(f => ({...f, codigo_produto: e.target.value}))} placeholder="SKU, código interno..." className={INPUT} />
                </Field>
                <Field label="Cor">
                  <input type="text" value={form.cor} onChange={e => setForm(f => ({...f, cor: e.target.value}))} placeholder="Preto, Branco, Azul..." className={INPUT} />
                </Field>
              </div>

              {/* Gênero */}
              <Field label="Gênero">
                <div className="flex gap-2">
                  {([['M', 'Masculino'], ['F', 'Feminino'], ['U', 'Unissex'], ['I', 'Infantil']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, genero: f.genero === val ? '' : val }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        form.genero === val
                          ? val === 'M' ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : val === 'F' ? 'bg-pink-500/20 border-pink-500/50 text-pink-300'
                          : val === 'I' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-zinc-600/40 border-zinc-500/50 text-zinc-200'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Categoria */}
              <Field label="Categoria *">
                <div className="grid grid-cols-6 gap-2">
                  {(['camiseta', 'regata', 'calca', 'polo', 'tenis', 'chinelo', 'outros'] as Produto['categoria'][]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoriaChange(cat)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
                        form.categoria === cat
                          ? `${CAT_COLOR[cat]} border-current`
                          : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-white'
                      }`}
                    >
                      {CAT_LABEL[cat]}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Tamanhos */}
              {form.categoria && form.categoria !== 'outros' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-300">Tamanhos disponíveis</label>
                    <span className="text-xs text-zinc-500">{form.tamanhos.length} selecionado{form.tamanhos.length !== 1 ? 's' : ''} · {totalQtd(form.tamanhos)} peças</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sizeOptions.map(size => {
                      const item = form.tamanhos.find(t => t.tamanho === size)
                      return item ? (
                        <div key={size} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 border border-violet-500/60 bg-violet-500/10 rounded-lg">
                          <span className="text-sm font-semibold text-violet-200">{size}</span>
                          <input
                            type="number" min="0" value={item.qtd}
                            onChange={e => setTamanhoQtd(size, Number(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            className="w-12 text-center bg-zinc-800 border border-zinc-600 rounded text-sm py-0.5 outline-none focus:border-violet-400 text-white"
                          />
                          <button onClick={() => toggleTamanho(size)} className="p-0.5 text-zinc-500 hover:text-red-400 transition cursor-pointer"><IconX size={13}/></button>
                        </div>
                      ) : (
                        <button key={size} onClick={() => toggleTamanho(size)} className="px-4 py-2 border border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg text-sm transition cursor-pointer">
                          {size}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-zinc-600">Clique num tamanho para adicionar, depois defina a quantidade</p>
                </div>
              )}

              {/* Quantidade — outros */}
              {form.categoria === 'outros' && (
                <Field label="Quantidade em estoque">
                  <input type="number" min="0" value={form.qtd_outros} onChange={e => setForm(f => ({...f, qtd_outros: e.target.value}))} placeholder="0" className={INPUT} />
                </Field>
              )}

              {/* Preços */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Preço de Custo (R$)">
                  <input type="number" min="0" step="0.01" value={form.preco_custo} onChange={e => setForm(f => ({...f, preco_custo: e.target.value}))} placeholder="0,00" className={INPUT} />
                </Field>
                <Field label="Preço de Venda (R$)">
                  <input type="number" min="0" step="0.01" value={form.preco_venda} onChange={e => setForm(f => {
                    const custo = calcCusto(f.marca, e.target.value)
                    return { ...f, preco_venda: e.target.value, ...(custo && { preco_custo: custo }) }
                  })} placeholder="0,00" className={INPUT} />
                </Field>
              </div>

              {/* Margem preview */}
              {form.preco_custo && form.preco_venda && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm">
                  <span className="text-zinc-400">Margem de lucro:</span>
                  <span className={`font-semibold ${
                    Number(calcMargem(Number(form.preco_custo), Number(form.preco_venda))) >= 50 ? 'text-emerald-400' :
                    Number(calcMargem(Number(form.preco_custo), Number(form.preco_venda))) >= 20 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {calcMargem(Number(form.preco_custo), Number(form.preco_venda))}%
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Tributos ── */}
          {activeTab === 'tributos' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="NCM">
                  <input type="text" value={form.ncm} onChange={e => setForm(f => ({...f, ncm: e.target.value}))} placeholder="00000000" maxLength={8} className={INPUT} />
                </Field>
                <Field label="CFOP">
                  <input type="text" value={form.cfop} onChange={e => setForm(f => ({...f, cfop: e.target.value}))} placeholder="0000" maxLength={4} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ICMS">
                  <input type="text" value={form.icms} onChange={e => setForm(f => ({...f, icms: e.target.value}))} placeholder="CST / alíquota" className={INPUT} />
                </Field>
                <Field label="CEST">
                  <input type="text" value={form.cest} onChange={e => setForm(f => ({...f, cest: e.target.value}))} placeholder="0000000" maxLength={7} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="PIS">
                  <input type="text" value={form.pis} onChange={e => setForm(f => ({...f, pis: e.target.value}))} placeholder="CST / alíquota" className={INPUT} />
                </Field>
                <Field label="COFINS">
                  <input type="text" value={form.cofins} onChange={e => setForm(f => ({...f, cofins: e.target.value}))} placeholder="CST / alíquota" className={INPUT} />
                </Field>
              </div>
            </>
          )}

          {formError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{formError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Link href="/estoque" className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-3 transition text-center">
              Cancelar
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg py-3 transition cursor-pointer"
            >
              {saving ? 'Salvando...' : produto ? 'Salvar Alterações' : 'Adicionar Produto'}
            </button>
          </div>

        </div>
      </main>

      {scanning && <div className="fixed inset-0 z-[999] bg-[#09090b]/95 flex flex-col items-center justify-center gap-6">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800"/>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin"/>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-white">Analisando etiqueta com IA...</p>
          <p className="text-sm text-zinc-500 mt-1">Pode levar alguns segundos</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          </div>
          Claude Vision
        </div>
      </div>}
    </div>
  )
}
