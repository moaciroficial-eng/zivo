'use client'

import { useEffect, useRef, useState } from 'react'

/* Botão de conexão automática (Embedded Signup da Meta).
   O lojista clica, loga na conta Meta dele no popup oficial, e o Zivo
   recebe o `code` + WABA/phone pra finalizar no backend. Sem painel de
   desenvolvedor, sem colar credencial na mão. */

type FbLoginResponse = { authResponse?: { code?: string } | null }
type FbSdk = {
  init: (opts: Record<string, unknown>) => void
  login: (cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>) => void
}
declare global {
  interface Window { FB?: FbSdk; fbAsyncInit?: () => void }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID

export default function MetaEmbeddedSignup({ onDone }: { onDone: (msg: string, ok: boolean) => void }) {
  const [carregando, setCarregando] = useState(false)
  const [sdkPronto, setSdkPronto]   = useState(false)
  const sessao = useRef<{ waba_id?: string; phone_number_id?: string }>({})

  useEffect(() => {
    if (!APP_ID) return

    // Captura os IDs (WABA + número) que o popup emite via postMessage
    function onMessage(event: MessageEvent) {
      if (typeof event.origin === 'string' && !event.origin.includes('facebook.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data) {
          if (data.data.waba_id) sessao.current.waba_id = data.data.waba_id
          if (data.data.phone_number_id) sessao.current.phone_number_id = data.data.phone_number_id
        }
      } catch { /* ignora mensagens que não são JSON */ }
    }
    window.addEventListener('message', onMessage)

    if (window.FB) {
      setSdkPronto(true)
    } else {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' })
        setSdkPronto(true)
      }
      const id = 'facebook-jssdk'
      if (!document.getElementById(id)) {
        const js = document.createElement('script')
        js.id = id; js.async = true; js.defer = true; js.crossOrigin = 'anonymous'
        js.src = 'https://connect.facebook.net/en_US/sdk.js'
        document.body.appendChild(js)
      }
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function conectar() {
    if (!window.FB || !CONFIG_ID) { onDone('Conexão automática indisponível (config Meta ausente).', false); return }
    setCarregando(true)
    sessao.current = {}
    window.FB.login((response) => {
      const code = response?.authResponse?.code
      if (!code) { setCarregando(false); onDone('Conexão cancelada.', false); return }
      // pequena espera pra garantir que o postMessage com WABA/phone chegou
      setTimeout(async () => {
        try {
          const res = await fetch('/api/whatsapp/meta/embedded-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, wabaId: sessao.current.waba_id, phoneNumberId: sessao.current.phone_number_id }),
          })
          const d = await res.json().catch(() => ({}))
          if (d?.ok) onDone('WhatsApp conectado! Os templates entram em aprovação na Meta.', true)
          else onDone(d?.erro || 'Falha ao finalizar a conexão.', false)
        } catch {
          onDone('Falha ao finalizar a conexão.', false)
        } finally {
          setCarregando(false)
        }
      }, 600)
    }, {
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: '3' },
    })
  }

  if (!APP_ID || !CONFIG_ID) {
    return <p className="text-xs text-zinc-600">Conexão automática (Embedded Signup) ainda não habilitada no servidor. Use a conexão manual abaixo.</p>
  }

  return (
    <button
      type="button"
      onClick={conectar}
      disabled={carregando || !sdkPronto}
      className="w-full py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-black font-semibold text-sm transition disabled:opacity-50"
    >
      {carregando ? 'Conectando...' : sdkPronto ? 'Conectar WhatsApp automaticamente' : 'Carregando...'}
    </button>
  )
}
