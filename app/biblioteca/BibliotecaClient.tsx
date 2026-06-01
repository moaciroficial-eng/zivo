'use client'

import { useState, useRef, ChangeEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import MobileNav from '@/app/components/MobileNav'
import BarcodeScanner, { type ScanLabelResult } from '@/app/components/BarcodeScanner'

/* ── Types ─────────────────────────────────────────────────── */

type BibliotecaFoto = {
  id: string
  url: string
  storage_path: string
  modelo: string
  marca: string | null
  estoque_ids: string[]
  created_at: string
}

type EstoqueItem = {
  id: string
  nome: string
  marca: string | null
  codigo_barras: string | null
}

/* ── Size utils ─────────────────────────────────────────────── */

const SIZES = [
  'PLUS', 'EXTRA', 'XGG', 'GG', 'PP', 'XS', 'XL', 'XXL', 'XXXL',
  'P', 'M', 'G', 'S', 'L', 'U',
  '60', '58', '56', '54', '52', '50', '48', '46', '44', '42', '40', '38', '36', '34', '32',
]

function extractModelo(nome: string): string {
  const upper = nome.toUpperCase().trim()
  for (const t of SIZES) {
    if (upper.endsWith(' ' + t)) return nome.slice(0, nome.length - t.length - 1).trim()
  }
  return nome
}

function extractTamanho(nome: string): string | null {
  const upper = nome.toUpperCase().trim()
  for (const t of SIZES) {
    if (upper.endsWith(' ' + t)) return t
  }
  return null
}

function findVariants(product: EstoqueItem, all: EstoqueItem[]): EstoqueItem[] {
  const modelo = extractModelo(product.nome).toLowerCase()
  return all.filter(item => extractModelo(item.nome).toLowerCase() === modelo)
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = document.createElement('img')
    img.onload = () => {
      const maxW = 1200
      const scale = Math.min(1, maxW / img.naturalWidth)
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

/* ── Icons ──────────────────────────────────────────────────── */

const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconX = ({ size = 18 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconArrowLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
const IconCheck = ({ size = 14 }: { size?: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconCamera = () => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IconBarcode = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/><line x1="16" y1="8" x2="16" y2="16"/></svg>
const IconImage = () => <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
const IconPhotos = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="16" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><circle cx="9" cy="13" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L11 16"/></svg>

/* ── Main component ─────────────────────────────────────────── */

export default function BibliotecaClient({
  user,
  initialFotos,
  estoqueItems,
}: {
  user: { id: string; email: string }
  initialFotos: BibliotecaFoto[]
  estoqueItems: EstoqueItem[]
}) {
  const supabase = createClient()
  const [fotos, setFotos] = useState<BibliotecaFoto[]>(initialFotos)
  const [drawer, setDrawer] = useState(false)
  const [step, setStep] = useState<'photo' | 'link'>('photo')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [searchDropdown, setSearchDropdown] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<EstoqueItem | null>(null)
  const [variants, setVariants] = useState<EstoqueItem[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [viewFoto, setViewFoto] = useState<BibliotecaFoto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [searchGrid, setSearchGrid] = useState('')
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  /* ── Product search ── */

  const productsFiltrados = productSearch.length >= 1
    ? estoqueItems.filter(e =>
        e.nome.toLowerCase().includes(productSearch.toLowerCase()) ||
        (e.marca?.toLowerCase().includes(productSearch.toLowerCase()) ?? false)
      ).slice(0, 8)
    : []

  function selectProduct(p: EstoqueItem) {
    setSelectedProduct(p)
    const vars = findVariants(p, estoqueItems)
    setVariants(vars)
    setProductSearch(p.nome + (p.marca ? ` — ${p.marca}` : ''))
    setSearchDropdown(false)
  }

  function onScanBarcode(barcode: string) {
    setShowScanner(false)
    const found = estoqueItems.find(e => e.codigo_barras === barcode)
    if (found) { selectProduct(found); showToast(`Produto: ${found.nome}`) }
    else showToast(`Código ${barcode} não encontrado no estoque`, 'error')
  }

  function onLabelScanned(data: ScanLabelResult) {
    setShowScanner(false)

    // Usa a foto da etiqueta como foto do produto
    if (data.photoFile) {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoFile(data.photoFile)
      setPhotoPreview(URL.createObjectURL(data.photoFile))
    }

    if (!data.nome && !data.marca) {
      showToast('Não foi possível identificar o produto na etiqueta', 'error')
      if (data.photoFile) setStep('link')
      return
    }

    const nomeLower  = (data.nome  ?? '').toLowerCase()
    const marcaLower = (data.marca ?? '').toLowerCase()

    const scored = estoqueItems.map(item => {
      let score = 0
      const itemNome  = item.nome.toLowerCase()
      const itemMarca = (item.marca ?? '').toLowerCase()
      const words = nomeLower.split(' ').filter(w => w.length > 2)
      words.forEach(w => { if (itemNome.includes(w)) score += 2 })
      if (marcaLower && itemMarca.includes(marcaLower)) score += 3
      if (data.tamanho && itemNome.endsWith(' ' + data.tamanho.toLowerCase())) score += 2
      return { item, score }
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score)

    if (scored.length > 0) {
      selectProduct(scored[0].item)
      showToast(`Produto identificado: ${scored[0].item.nome}`)
    } else {
      const q = [data.nome, data.marca, data.tamanho].filter(Boolean).join(' ')
      setProductSearch(q)
      setSearchDropdown(true)
      showToast('Produto não encontrado — refine a busca', 'error')
    }

    // Avança para step 2 automaticamente
    setStep('link')
  }

  /* ── Photo ── */

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  /* ── Drawer ── */

  function openDrawer() {
    setStep('photo')
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview('')
    setProductSearch('')
    setSelectedProduct(null)
    setVariants([])
    setSearchDropdown(false)
    setDrawer(true)
  }

  function closeDrawer() {
    setDrawer(false)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }

  /* ── Save ── */

  async function handleSave() {
    if (!photoFile || !selectedProduct) return
    setSaving(true)
    try {
      const compressed = await compressImage(photoFile)
      const path = `${user.id}/${Date.now()}.jpg`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('biblioteca')
        .upload(path, compressed, { contentType: 'image/jpeg' })

      if (uploadError) { showToast(uploadError.message, 'error'); setSaving(false); return }

      const { data: { publicUrl } } = supabase.storage.from('biblioteca').getPublicUrl(uploadData.path)

      const modelo = extractModelo(selectedProduct.nome)
      const { data, error } = await supabase.from('biblioteca_fotos').insert({
        user_id: user.id,
        url: publicUrl,
        storage_path: uploadData.path,
        modelo,
        marca: selectedProduct.marca,
        estoque_ids: variants.map(v => v.id),
      }).select()

      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      if (data?.[0]) setFotos(fs => [data[0], ...fs])
      showToast(`Foto vinculada a ${variants.length} produto(s)`)
      closeDrawer()
    } catch {
      showToast('Erro ao salvar foto', 'error')
    }
    setSaving(false)
  }

  /* ── Delete ── */

  async function handleDelete(foto: BibliotecaFoto) {
    await supabase.storage.from('biblioteca').remove([foto.storage_path])
    await supabase.from('biblioteca_fotos').delete().eq('id', foto.id)
    setFotos(fs => fs.filter(f => f.id !== foto.id))
    setViewFoto(null)
    setConfirmDelete(false)
    showToast('Foto removida.')
  }

  /* ── Toast ── */

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  /* ── Derived ── */

  function getSizes(foto: BibliotecaFoto): string[] {
    const sizes = foto.estoque_ids
      .map(id => estoqueItems.find(e => e.id === id))
      .filter(Boolean)
      .map(e => extractTamanho(e!.nome))
      .filter((t): t is string => t !== null)
    return [...new Set(sizes)]
  }

  const fotosFiltered = searchGrid
    ? fotos.filter(f => f.modelo.toLowerCase().includes(searchGrid.toLowerCase()) || (f.marca?.toLowerCase().includes(searchGrid.toLowerCase()) ?? false))
    : fotos

  const totalVinculados = fotos.reduce((s, f) => s + f.estoque_ids.length, 0)
  const modelos = new Set(fotos.map(f => f.modelo)).size

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-20 md:pb-0">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
              <Link href="/dashboard" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Dashboard</Link>
              <Link href="/clientes" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Clientes</Link>
              <Link href="/vendas" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Vendas</Link>
              <Link href="/estoque" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Estoque</Link>
              <Link href="/calendario" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Agenda</Link>
              <span className="text-zinc-700 select-none">/</span>
              <span className="px-3 py-1.5 font-medium bg-zinc-800 rounded-lg">Biblioteca</span>
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

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Title + action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Biblioteca de Fotos</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Fotos dos produtos vinculadas por modelo e tamanho</p>
          </div>
          <button
            onClick={openDrawer}
            className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2.5 transition cursor-pointer shadow-lg shadow-violet-500/20"
          >
            <IconPlus /> Adicionar foto
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Fotos', value: fotos.length },
            { label: 'Modelos', value: modelos },
            { label: 'Vinculados', value: totalVinculados },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-5 flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border ${
            toast.type === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'
          }`}>
            {toast.type === 'success' ? <IconCheck /> : <IconX size={14} />}
            {toast.msg}
          </div>
        )}

        {/* Search */}
        {fotos.length > 0 && (
          <div className="mb-5">
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><IconSearch /></span>
              <input
                type="text"
                placeholder="Buscar por modelo ou marca..."
                value={searchGrid}
                onChange={e => setSearchGrid(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-violet-500 transition"
              />
            </div>
          </div>
        )}

        {/* Grid */}
        {fotosFiltered.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-600">
              <IconPhotos />
            </div>
            <div>
              <p className="font-semibold text-zinc-300">
                {fotos.length > 0 ? `Nenhuma foto para "${searchGrid}"` : 'Nenhuma foto ainda'}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {fotos.length > 0 ? '' : 'Tire uma foto do produto e da etiqueta para começar.'}
              </p>
            </div>
            {fotos.length === 0 && (
              <button
                onClick={openDrawer}
                className="mt-2 flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg px-5 py-2.5 transition cursor-pointer"
              >
                <IconCamera /> Adicionar primeira foto
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {fotosFiltered.map(foto => {
              const sizes = getSizes(foto)
              return (
                <div
                  key={foto.id}
                  className="group cursor-pointer"
                  onClick={() => { setViewFoto(foto); setConfirmDelete(false) }}
                >
                  <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-800 mb-3 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={foto.url}
                      alt={foto.modelo}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    {foto.estoque_ids.length > 0 && (
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                        {foto.estoque_ids.length}
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-sm text-white truncate">{foto.modelo}</p>
                  {foto.marca && <p className="text-xs text-zinc-500 mb-1.5">{foto.marca}</p>}
                  {sizes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sizes.map(s => (
                        <span key={s} className="text-[10px] font-bold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── View foto modal ── */}
      {viewFoto && (
        <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewFoto(null)}>
          <div className="relative max-w-md w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewFoto(null)} className="absolute -top-10 right-0 text-zinc-400 hover:text-white transition cursor-pointer">
              <IconX size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewFoto.url} alt={viewFoto.modelo} className="w-full rounded-2xl shadow-2xl" />
            <div className="mt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-white text-lg">{viewFoto.modelo}</p>
                  {viewFoto.marca && <p className="text-zinc-400 text-sm">{viewFoto.marca}</p>}
                </div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer shrink-0"
                  >
                    <IconTrash />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400">Excluir?</span>
                    <button onClick={() => handleDelete(viewFoto)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"><IconCheck size={14}/></button>
                    <button onClick={() => setConfirmDelete(false)} className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded-lg transition cursor-pointer"><IconX size={14}/></button>
                  </div>
                )}
              </div>
              {getSizes(viewFoto).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {getSizes(viewFoto).map(s => (
                    <span key={s} className="text-sm font-bold bg-violet-500/20 text-violet-300 px-3 py-1 rounded-full border border-violet-500/30">{s}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-600 mt-3">{viewFoto.estoque_ids.length} produto(s) vinculado(s)</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-stretch sm:justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <div className="relative w-full sm:max-w-md bg-zinc-900 border-t border-zinc-800 sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none h-[90vh] sm:h-full flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 shrink-0">
              {step === 'link' && (
                <button onClick={() => setStep('photo')} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                  <IconArrowLeft />
                </button>
              )}
              <h2 className="font-semibold text-lg flex-1">
                {step === 'photo' ? 'Foto do produto' : 'Vincular ao estoque'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span className={step === 'photo' ? 'text-violet-400 font-bold' : ''}>1. Foto</span>
                <span>→</span>
                <span className={step === 'link' ? 'text-violet-400 font-bold' : ''}>2. Vincular</span>
              </div>
              <button onClick={closeDrawer} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                <IconX />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col gap-5">

              {step === 'photo' && (
                <>
                  {/* Upload area */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />

                  {photoPreview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Preview" className="w-full max-h-72 object-contain rounded-2xl bg-zinc-800" />
                      <div className="absolute bottom-3 right-3 flex gap-1.5">
                        <button onClick={() => fileInputRef.current?.click()} className="bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm hover:bg-black/90 transition cursor-pointer">
                          Câmera
                        </button>
                        <button onClick={() => galleryInputRef.current?.click()} className="bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg backdrop-blur-sm hover:bg-black/90 transition cursor-pointer">
                          Galeria
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 w-full">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 flex flex-col items-center justify-center gap-2 py-8 bg-zinc-800/50 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 hover:bg-zinc-800 rounded-2xl transition cursor-pointer text-zinc-500 hover:text-zinc-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                          </svg>
                          <span className="text-xs font-medium">Câmera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="flex-1 flex flex-col items-center justify-center gap-2 py-8 bg-zinc-800/50 border-2 border-dashed border-zinc-700 hover:border-violet-500/50 hover:bg-zinc-800 rounded-2xl transition cursor-pointer text-zinc-500 hover:text-zinc-300"
                        >
                          <IconImage />
                          <span className="text-xs font-medium">Galeria</span>
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600 text-center">Foto do produto para a biblioteca</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-xs text-zinc-600">ou</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-violet-400 border border-zinc-700 hover:border-violet-500/50 rounded-xl py-3 w-full transition cursor-pointer"
                  >
                    <IconBarcode /> Tirar foto da etiqueta — IA identifica o produto
                  </button>

                  <p className="text-xs text-zinc-600 text-center">
                    A foto da etiqueta será usada como foto do produto e a IA identifica o modelo automaticamente
                  </p>
                </>
              )}

              {step === 'link' && (
                <>
                  {/* Photo thumbnail */}
                  {photoPreview && (
                    <div className="flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Preview" className="w-14 h-14 rounded-lg object-cover bg-zinc-800" />
                      <div>
                        <p className="text-sm font-medium text-zinc-200">Foto selecionada</p>
                        <p className="text-xs text-zinc-500">Agora vincule ao produto</p>
                      </div>
                    </div>
                  )}

                  {/* Product search */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-300">Produto</label>
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><IconSearch /></span>
                        <input
                          type="text"
                          value={productSearch}
                          onChange={e => { setProductSearch(e.target.value); setSelectedProduct(null); setVariants([]); setSearchDropdown(true) }}
                          onFocus={() => setSearchDropdown(true)}
                          onBlur={() => setTimeout(() => setSearchDropdown(false), 200)}
                          placeholder="Buscar produto por nome..."
                          autoComplete="off"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-violet-500 transition"
                        />
                        {searchDropdown && productsFiltrados.length > 0 && (
                          <div className="absolute z-20 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                            {productsFiltrados.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => selectProduct(p)}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-500/20 transition flex items-center justify-between gap-2"
                              >
                                <div>
                                  <p className="text-zinc-200 font-medium">{p.nome}</p>
                                  {p.marca && <p className="text-xs text-zinc-500">{p.marca}</p>}
                                </div>
                                {extractTamanho(p.nome) && (
                                  <span className="text-xs font-bold bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full shrink-0">{extractTamanho(p.nome)}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="p-2.5 bg-zinc-800 border border-zinc-700 text-violet-400 hover:bg-zinc-700 rounded-xl transition cursor-pointer shrink-0"
                        title="Escanear código de barras"
                      >
                        <IconBarcode />
                      </button>
                    </div>
                  </div>

                  {/* Variants */}
                  {selectedProduct && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-300">Variações encontradas</p>
                        <span className="text-xs font-bold bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full">
                          {variants.length} produto{variants.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {variants.length > 1 ? (
                        <>
                          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl overflow-hidden">
                            {variants.map((v, idx) => {
                              const tamanho = extractTamanho(v.nome)
                              return (
                                <div
                                  key={v.id}
                                  className={`flex items-center gap-3 px-4 py-3 ${idx < variants.length - 1 ? 'border-b border-zinc-700/50' : ''}`}
                                >
                                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                                    {tamanho ?? '—'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-zinc-200 truncate">{v.nome}</p>
                                    {v.marca && <p className="text-xs text-zinc-500">{v.marca}</p>}
                                  </div>
                                  <IconCheck size={14} />
                                </div>
                              )
                            })}
                          </div>
                          <p className="text-xs text-zinc-500 text-center">
                            A foto será aplicada a todos os tamanhos deste modelo automaticamente
                          </p>
                        </>
                      ) : (
                        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {extractTamanho(selectedProduct.nome) ?? '—'}
                          </div>
                          <div>
                            <p className="text-sm text-zinc-200">{selectedProduct.nome}</p>
                            {selectedProduct.marca && <p className="text-xs text-zinc-500">{selectedProduct.marca}</p>}
                          </div>
                          <IconCheck size={14} />
                        </div>
                      )}

                      {/* Modelo preview */}
                      <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-800/30 rounded-xl px-4 py-2.5">
                        <span>Modelo detectado:</span>
                        <span className="font-semibold text-zinc-300">{extractModelo(selectedProduct.nome)}</span>
                      </div>
                    </div>
                  )}

                  {productSearch.length >= 1 && productsFiltrados.length === 0 && !selectedProduct && (
                    <p className="text-sm text-zinc-500 text-center">Nenhum produto encontrado — cadastre no estoque primeiro</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={closeDrawer} className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 transition cursor-pointer">
                Cancelar
              </button>
              {step === 'photo' ? (
                <button
                  onClick={() => setStep('link')}
                  disabled={!photoFile}
                  className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  Próximo
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!selectedProduct || saving}
                  className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 transition cursor-pointer"
                >
                  {saving ? 'Salvando...' : `Vincular a ${variants.length || 1} produto(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <MobileNav />

      {showScanner && (
        <BarcodeScanner
          onScan={onScanBarcode}
          onClose={() => setShowScanner(false)}
          onLabelScan={onLabelScanned}
        />
      )}
    </div>
  )
}
