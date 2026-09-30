'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/* Registra o Service Worker e oferece "instalar na tela inicial".
   O banner só aparece nas áreas do dono (não na vitrine do clube nem
   nas páginas públicas), some quando o app já está instalado e pode ser
   dispensado (lembra no localStorage). */

// Rotas onde NÃO mostramos o convite de instalar.
const OCULTAR_EM = ['/clube', '/login', '/signup', '/termos', '/privacidade', '/exclusao-de-dados']

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function PWA() {
  const pathname = usePathname() || '/'
  const [deferred, setDeferred] = useState<PromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [standalone, setStandalone] = useState(true) // assume instalado até provar o contrário (evita flash)
  const [dispensado, setDispensado] = useState(true)

  // Registra o service worker uma vez.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])

  useEffect(() => {
    const emStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setStandalone(emStandalone)

    const ua = window.navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(ios)

    try { setDispensado(localStorage.getItem('terny_pwa_dispensado') === '1') } catch { setDispensado(false) }

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as PromptEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const onInstalled = () => { setStandalone(true); setDeferred(null) }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const rotaOculta = OCULTAR_EM.some((p) => pathname === p || pathname.startsWith(p + '/'))
  // No Android/desktop só mostra se o navegador ofereceu o prompt; no iOS mostra as instruções.
  const podeMostrar = !standalone && !dispensado && !rotaOculta && (deferred !== null || isIOS)
  if (!podeMostrar) return null

  function dispensar() {
    setDispensado(true)
    try { localStorage.setItem('terny_pwa_dispensado', '1') } catch {}
  }

  async function instalar() {
    if (!deferred) return
    await deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[#C79A54]/30 bg-[#141317]/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-[#0B0B0D] border border-white/5 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 100 100">
              <path d="M50 27 L50 73" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
              <path d="M32 38 L68 38" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#F4EFE7]">Instalar o Terny no celular</p>
            {isIOS && !deferred ? (
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Toque em <span className="text-zinc-200">Compartilhar</span> <span aria-hidden>⎋</span> e depois em{' '}
                <span className="text-zinc-200">“Adicionar à Tela de Início”</span> <span aria-hidden>➕</span>.
              </p>
            ) : (
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Abra direto do ícone, como um app — sem precisar do navegador.
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              {deferred && (
                <button
                  onClick={instalar}
                  className="text-sm font-semibold bg-[#C79A54] hover:bg-[#B98C46] text-[#16151A] rounded-lg px-3.5 py-1.5 transition"
                >
                  Instalar
                </button>
              )}
              <button
                onClick={dispensar}
                className="text-sm text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 transition"
              >
                Agora não
              </button>
            </div>
          </div>
          <button onClick={dispensar} aria-label="Fechar" className="shrink-0 text-zinc-500 hover:text-zinc-300 transition -mt-1 -mr-1 p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
