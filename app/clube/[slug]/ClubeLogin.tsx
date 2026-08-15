'use client'

import { useState } from 'react'

export default function ClubeLogin({ slug, nomeLoja, cadastroAberto }: { slug: string; nomeLoja: string; cadastroAberto: boolean }) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  async function entrar() {
    setErro('')
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErro('Digite um email válido.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/clube/entrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: e, nome: nome.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (d?.ok) { location.reload() }
      else { setErro(d?.erro || 'Não foi possível entrar.'); setBusy(false) }
    } catch { setErro('Falha de conexão.'); setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0f] to-[#12101a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">👑</div>
        <h1 className="text-2xl font-bold">Clube {nomeLoja}</h1>
        <p className="text-zinc-400 text-sm mt-2 mb-6">
          {cadastroAberto
            ? 'Ofertas secretas só pra VIP. Entre com seu email pra garantir seu acesso.'
            : 'Área exclusiva de membros. Entre com o email do seu cadastro.'}
        </p>

        <div className="space-y-3 text-left">
          {cadastroAberto && (
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500" />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email" placeholder="seu@email.com"
            onKeyDown={e => e.key === 'Enter' && entrar()}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500" />
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <button onClick={entrar} disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-sm transition disabled:opacity-50">
            {busy ? 'Entrando...' : cadastroAberto ? 'Quero ser VIP' : 'Entrar'}
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-6">
          {cadastroAberto ? 'O cadastro fecha em breve — depois só quem já é VIP acessa.' : 'Cadastro encerrado. Só membros existentes.'}
        </p>
      </div>
    </div>
  )
}
