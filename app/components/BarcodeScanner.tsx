'use client'

import { useEffect, useRef, useState } from 'react'

export type ScanLabelResult = {
  nome: string | null
  marca: string | null
  tamanho: string | null
  codigo_produto: string | null
  photoFile?: File
}

type Props = {
  onScan: (barcode: string) => void
  onClose: () => void
  onLabelScan?: (data: ScanLabelResult) => void
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const IconCamera = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

const IconSpinner = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)

export default function BarcodeScanner({ onScan, onClose, onLabelScan }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const photoInputRef    = useRef<HTMLInputElement>(null)
  const galleryInputRef  = useRef<HTMLInputElement>(null)

  const [error, setError]           = useState<string | null>(null)
  const [manual, setManual]         = useState('')
  const [supported, setSupported]   = useState(true)
  const [mode, setMode]             = useState<'scan' | 'photo'>('scan')
  const [scanning, setScanning]     = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [preview, setPreview]       = useState<string>('')

  /* ── Camera / BarcodeDetector ── */
  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!('BarcodeDetector' in window)) { setSupported(false); return }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }

        // @ts-expect-error BarcodeDetector not in TS lib yet
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] })

        async function detect() {
          if (cancelled || !videoRef.current) return
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0) { const v = barcodes[0].rawValue; if (v) { onScan(v); return } }
            } catch { /* frame skip */ }
          }
          rafRef.current = requestAnimationFrame(detect)
        }
        rafRef.current = requestAnimationFrame(detect)
      } catch { if (!cancelled) setError('Não foi possível acessar a câmera. Verifique as permissões.') }
    }

    if (mode === 'scan') start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onScan, mode])

  /* ── AI label photo ── */
  async function handleLabelPhoto(file: File) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    setScanning(true)
    setPhotoError(null)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/scan-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPhotoError(data.error ?? 'Não foi possível ler a etiqueta. Tente uma foto mais nítida.')
      } else {
        onLabelScan?.({ nome: data.nome ?? null, marca: data.marca ?? null, tamanho: data.tamanho ?? null, codigo_produto: data.codigo_produto ?? null, photoFile: file })
      }
    } catch {
      setPhotoError('Erro ao enviar foto. Tente novamente.')
    }
    setScanning(false)
  }

  const showCamera = supported && !error && mode === 'scan'
  const showPhoto  = !supported || !!error || mode === 'photo'

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <div className="flex items-center gap-3">
          <p className="text-white font-medium text-sm">Escanear etiqueta</p>
          {/* Mode tabs — only show on Android where BarcodeDetector works */}
          {supported && !error && onLabelScan && (
            <div className="flex bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setMode('scan')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${mode === 'scan' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Scanner
              </button>
              <button
                onClick={() => { setMode('photo'); setPhotoError(null); setPreview('') }}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${mode === 'photo' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Foto IA
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white p-1.5 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* ── Camera view (BarcodeDetector) ── */}
      {showCamera && (
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-44">
              <div className="absolute top-0 left-0 w-8 h-8 border-violet-400 rounded-tl-md" style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
              <div className="absolute top-0 right-0 w-8 h-8 border-violet-400 rounded-tr-md" style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-violet-400 rounded-bl-md" style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-violet-400 rounded-br-md" style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
              <div className="absolute left-0 right-0 h-0.5 bg-violet-400/80 animate-scan" style={{ top: '50%' }} />
            </div>
          </div>
          <p className="absolute bottom-8 left-0 right-0 text-center text-white/70 text-xs">
            Aponte para o código de barras da etiqueta
          </p>
        </div>
      )}

      {/* ── Photo / IA mode ── */}
      {showPhoto && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          {/* Câmera */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLabelPhoto(f) }}
          />
          {/* Galeria */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLabelPhoto(f) }}
          />

          {scanning ? (
            /* Loading */
            <div className="flex flex-col items-center gap-5">
              {preview && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt="Etiqueta" className="w-44 h-44 object-cover rounded-2xl shadow-xl" />
              )}
              <div className="flex items-center gap-2.5 text-violet-400">
                <IconSpinner />
                <p className="font-medium">IA lendo a etiqueta...</p>
              </div>
              <p className="text-xs text-zinc-600 text-center">Identificando produto, marca e tamanho</p>
            </div>
          ) : (
            <>
              {/* Photo preview or placeholder */}
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt="Etiqueta" className="w-44 h-44 object-cover rounded-2xl shadow-xl" />
              ) : (
                <div className="w-44 h-44 rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center gap-2 text-zinc-600">
                  <IconCamera />
                  <p className="text-xs">Foto da etiqueta</p>
                </div>
              )}

              {/* Main CTA */}
              {onLabelScan && (
                <div className="flex gap-3 w-full max-w-xs">
                  <button
                    onClick={() => { setPhotoError(null); photoInputRef.current?.click() }}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl px-4 py-4 text-sm transition cursor-pointer shadow-lg shadow-violet-500/30"
                  >
                    <IconCamera />
                    <span className="text-xs">Câmera</span>
                  </button>
                  <button
                    onClick={() => { setPhotoError(null); galleryInputRef.current?.click() }}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold rounded-2xl px-4 py-4 text-sm transition cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-xs">Galeria</span>
                  </button>
                </div>
              )}

              {photoError && (
                <p className="text-sm text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 max-w-xs">{photoError}</p>
              )}

              {onLabelScan && (
                <p className="text-xs text-zinc-600 text-center max-w-xs">
                  A IA identifica produto, marca e tamanho automaticamente pela foto da etiqueta
                </p>
              )}

              {/* Divider + manual input (fallback when no BarcodeDetector) */}
              {(!supported || !!error) && (
                <>
                  <div className="flex items-center gap-3 w-full max-w-xs">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-xs text-zinc-700">ou</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                  <div className="w-full max-w-xs flex flex-col gap-2">
                    <p className="text-xs text-zinc-600 text-center">Digitar código de barras</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manual}
                      onChange={e => setManual(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) onScan(manual.trim()) }}
                      placeholder="Ex: 7891234567890"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-center rounded-xl px-4 py-3 text-sm tracking-widest outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={() => { if (manual.trim()) onScan(manual.trim()) }}
                      disabled={!manual.trim()}
                      className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-semibold rounded-xl px-8 py-2.5 text-sm transition cursor-pointer border border-zinc-700"
                    >
                      Confirmar código
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-40px); opacity: 0.6; }
          50% { transform: translateY(40px); opacity: 1; }
        }
        .animate-scan { animation: scan 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
