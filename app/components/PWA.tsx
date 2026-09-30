'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { VAPID_PUBLIC_KEY } from '@/lib/push-public'

/* Registra o Service Worker, oferece "instalar na tela inicial" e, depois,
   "ativar avisos" (push). Mostra UM banner por vez e só nas áreas do dono
   (não na vitrine do clube nem nas páginas públicas). Tudo dispensável. */

const OCULTAR_EM = ['/clube', '/login', '/signup', '/termos', '/privacidade', '/exclusao-de-dados']

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buffer = new ArrayBuffer(raw.length)
  const arr = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return buffer
}

export default function PWA() {
  const pathname = usePathname() || '/'
  const [deferred, setDeferred] = useState<PromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [standalone, setStandalone] = useState(true)   // assume instalado até provar (evita flash)
  const [instalarDispensado, setInstalarDispensado] = useState(true)

  const [pushSuportado, setPushSuportado] = useState(false)
  const [permissao, setPermissao] = useState<NotificationPermission>('denied')
  const [pushDispensado, setPushDispensado] = useState(true)
  const [ativando, setAtivando] = useState(false)

  /* Registra o service worker uma vez */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])

  useEffect(() => {
    const emStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setStandalone(emStandalone)

    const ua = window.navigator.userAgent
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream)

    const suportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setPushSuportado(suportado)
    if (suportado) setPermissao(Notification.permission)

    try {
      setInstalarDispensado(localStorage.getItem('terny_pwa_dispensado') === '1')
      setPushDispensado(localStorage.getItem('terny_push_dispensado') === '1')
    } catch { setInstalarDispensado(false); setPushDispensado(false) }

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as PromptEvent) }
    const onInstalled = () => { setStandalone(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dispensarInstalar = () => {
    setInstalarDispensado(true)
    try { localStorage.setItem('terny_pwa_dispensado', '1') } catch {}
  }
  const dispensarPush = () => {
    setPushDispensado(true)
    try { localStorage.setItem('terny_push_dispensado', '1') } catch {}
  }

  const instalar = async () => {
    if (!deferred) return
    await deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
  }

  const ativarNotificacoes = useCallback(async () => {
    setAtivando(true)
    try {
      const perm = await Notification.requestPermission()
      setPermissao(perm)
      if (perm !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        })
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      // Aviso de boas-vindas pra ele ver que funcionou
      fetch('/api/push/test', { method: 'POST' }).catch(() => {})
    } catch {
      /* silencioso — se falhar, o banner some e ele tenta de novo depois */
    } finally {
      setAtivando(false)
    }
  }, [])

  const rotaOculta = OCULTAR_EM.some((p) => pathname === p || pathname.startsWith(p + '/'))

  /* Prioridade: primeiro instalar; depois de instalado, ativar avisos */
  const mostrarInstalar =
    !rotaOculta && !standalone && !instalarDispensado && (deferred !== null || isIOS)

  const mostrarPush =
    !rotaOculta && !mostrarInstalar && pushSuportado && permissao === 'default' &&
    !pushDispensado && (!isIOS || standalone)

  if (!mostrarInstalar && !mostrarPush) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[#C79A54]/30 bg-[#141317]/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-[#0B0B0D] border border-white/5 flex items-center justify-center">
            {mostrarPush ? (
              <span className="text-xl">🔔</span>
            ) : (
              <svg width="26" height="26" viewBox="0 0 100 100">
                <path d="M50 27 L50 73" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
                <path d="M32 38 L68 38" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {mostrarPush ? (
              <>
                <p className="text-sm font-semibold text-[#F4EFE7]">Receber avisos no celular</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Saiba na hora quando chegar <span className="text-zinc-200">mensagem de cliente</span> — mesmo com o app fechado.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={ativarNotificacoes}
                    disabled={ativando}
                    className="text-sm font-semibold bg-[#C79A54] hover:bg-[#B98C46] disabled:opacity-60 text-[#16151A] rounded-lg px-3.5 py-1.5 transition"
                  >
                    {ativando ? 'Ativando…' : 'Ativar avisos'}
                  </button>
                  <button onClick={dispensarPush} className="text-sm text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 transition">
                    Agora não
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    <button onClick={instalar} className="text-sm font-semibold bg-[#C79A54] hover:bg-[#B98C46] text-[#16151A] rounded-lg px-3.5 py-1.5 transition">
                      Instalar
                    </button>
                  )}
                  <button onClick={dispensarInstalar} className="text-sm text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 transition">
                    Agora não
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={mostrarPush ? dispensarPush : dispensarInstalar}
            aria-label="Fechar"
            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition -mt-1 -mr-1 p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
