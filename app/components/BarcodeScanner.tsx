'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef    = useRef<number>(0)
  const [error, setError]     = useState<string | null>(null)
  const [manual, setManual]   = useState('')
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function start() {
      // Check BarcodeDetector support
      if (!('BarcodeDetector' in window)) {
        setSupported(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // @ts-expect-error BarcodeDetector not in TS lib yet
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] })

        async function detect() {
          if (cancelled || !videoRef.current) return
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0) {
                const value = barcodes[0].rawValue
                if (value) { onScan(value); return }
              }
            } catch { /* frame skip */ }
          }
          rafRef.current = requestAnimationFrame(detect)
        }
        rafRef.current = requestAnimationFrame(detect)
      } catch (e) {
        if (!cancelled) setError('Não foi possível acessar a câmera. Verifique as permissões.')
      }
    }

    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white font-medium text-sm">Escanear etiqueta</p>
        <button onClick={onClose} className="text-zinc-400 hover:text-white p-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Camera or fallback */}
      {!supported || error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="text-center">
            <p className="text-zinc-400 text-sm mb-1">
              {error ?? 'Seu navegador não suporta leitura de código de barras.'}
            </p>
            <p className="text-zinc-500 text-xs">Digite o código manualmente:</p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) onScan(manual.trim()) }}
            placeholder="Ex: 7891234567890"
            autoFocus
            className="w-full max-w-xs bg-zinc-800 border border-zinc-700 text-white text-center rounded-xl px-4 py-3 text-lg tracking-widest outline-none focus:border-violet-500"
          />
          <button
            onClick={() => { if (manual.trim()) onScan(manual.trim()) }}
            disabled={!manual.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-xl px-8 py-3 text-sm transition"
          >
            Confirmar
          </button>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-44">
              {/* Corner markers */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-violet-400 rounded-tl-md" style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-violet-400 rounded-tr-md" style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-violet-400 rounded-bl-md" style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-violet-400 rounded-br-md" style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
              {/* Scan line animation */}
              <div className="absolute left-0 right-0 h-0.5 bg-violet-400/80 animate-scan" style={{ top: '50%' }} />
            </div>
          </div>
          <p className="absolute bottom-8 left-0 right-0 text-center text-white/70 text-xs">
            Aponte para o código de barras da etiqueta
          </p>
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
