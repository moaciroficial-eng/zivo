'use client'

import { useState, useEffect } from 'react'

/* Controle do modo funcionária na sidebar:
   - Modo dono: botão "Ativar modo funcionária" (define PIN na 1ª vez).
   - Modo funcionária: aviso + "Sair" (pede o PIN do dono). */

type Estado = { modo: 'dono' | 'funcionaria'; temPin: boolean }

export default function ModoControle() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [dialog, setDialog] = useState<null | 'definir' | 'sair'>(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/modo').then(r => r.json()).then(setEstado).catch(() => {})
  }, [])

  async function entrar() {
    // se ainda não tem PIN, define primeiro
    if (!estado?.temPin) { setDialog('definir'); setErro(''); setPin(''); setPin2(''); return }
    setBusy(true)
    await fetch('/api/modo/entrar', { method: 'POST' })
    location.reload()
  }

  async function definirEEntrar() {
    setErro('')
    if (!/^\d{4,8}$/.test(pin)) { setErro('PIN de 4 a 8 dígitos.'); return }
    if (pin !== pin2) { setErro('Os PINs não conferem.'); return }
    setBusy(true)
    const r = await fetch('/api/modo/pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const d = await r.json().catch(() => ({}))
    if (!d.ok) { setBusy(false); setErro(d.erro || 'Erro ao definir o PIN.'); return }
    await fetch('/api/modo/entrar', { method: 'POST' })
    location.reload()
  }

  async function sair() {
    setErro('')
    if (!pin.trim()) { setErro('Digite o PIN.'); return }
    setBusy(true)
    const r = await fetch('/api/modo/sair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const d = await r.json().catch(() => ({}))
    if (!d.ok) { setBusy(false); setErro(d.erro || 'PIN incorreto.'); return }
    location.reload()
  }

  if (!estado) return null

  return (
    <div className="px-2 pb-2">
      {estado.modo === 'funcionaria' ? (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Modo funcionária
          </p>
          <button
            onClick={() => { setDialog('sair'); setErro(''); setPin('') }}
            className="mt-1.5 w-full text-xs font-medium text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-md py-1.5 transition cursor-pointer"
          >
            Sair (modo dono)
          </button>
        </div>
      ) : (
        <button
          onClick={entrar}
          disabled={busy}
          className="w-full flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg px-3 py-2 transition cursor-pointer disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Ativar modo funcionária
        </button>
      )}

      {/* Diálogo: definir PIN + entrar */}
      {dialog === 'definir' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setDialog(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white">Defina um PIN do dono</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Ele será pedido pra sair do modo funcionária. Guarde bem — sem ele não dá pra voltar ao modo completo.</p>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN (4 a 8 dígitos)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 mb-2" />
            <input type="password" inputMode="numeric" value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="Repita o PIN" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500" />
            {erro && <p className="text-xs text-red-400 mt-2">{erro}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDialog(null)} disabled={busy} className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg py-2 transition cursor-pointer disabled:opacity-50">Cancelar</button>
              <button onClick={definirEEntrar} disabled={busy} className="flex-1 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-lg py-2 transition cursor-pointer disabled:opacity-50">{busy ? '...' : 'Definir e ativar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo: sair (pede PIN) */}
      {dialog === 'sair' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setDialog(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white">Sair do modo funcionária</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Digite o PIN do dono para voltar ao modo completo.</p>
            <input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500" onKeyDown={e => e.key === 'Enter' && sair()} />
            {erro && <p className="text-xs text-red-400 mt-2">{erro}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDialog(null)} disabled={busy} className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg py-2 transition cursor-pointer disabled:opacity-50">Cancelar</button>
              <button onClick={sair} disabled={busy} className="flex-1 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-lg py-2 transition cursor-pointer disabled:opacity-50">{busy ? '...' : 'Sair'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
