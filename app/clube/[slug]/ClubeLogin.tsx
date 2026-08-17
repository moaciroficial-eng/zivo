'use client'

import { useState } from 'react'

export default function ClubeLogin({ slug, nomeLoja, cadastroAberto }: { slug: string; nomeLoja: string; cadastroAberto: boolean }) {
  // 'entrar' = já é VIP | 'cadastrar' = criar acesso (só se aberto)
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar')
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const cadastrando = modo === 'cadastrar'

  async function enviar() {
    setErro('')
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErro('Digite um email válido.'); return }
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Digite seu WhatsApp com DDD.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/clube/entrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: e, nome: nome.trim(), telefone: telefone.trim(), modo }),
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
        <p className="text-zinc-400 text-sm mt-2 mb-5">
          {cadastrando ? 'Crie seu acesso VIP e veja as ofertas secretas.' : 'Área exclusiva de membros. Entre com seu email e WhatsApp.'}
        </p>

        {/* Alternador de modo (só faz sentido se o cadastro estiver aberto) */}
        {cadastroAberto && (
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-4">
            <button onClick={() => { setModo('entrar'); setErro('') }} className={`flex-1 text-sm font-semibold rounded-lg py-2 transition ${!cadastrando ? 'bg-violet-600 text-white' : 'text-zinc-400'}`}>Já sou VIP</button>
            <button onClick={() => { setModo('cadastrar'); setErro('') }} className={`flex-1 text-sm font-semibold rounded-lg py-2 transition ${cadastrando ? 'bg-violet-600 text-white' : 'text-zinc-400'}`}>Criar acesso</button>
          </div>
        )}

        <div className="space-y-3 text-left">
          {cadastrando && (
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500" />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email" placeholder="seu@email.com"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500" />
          <input value={telefone} onChange={e => setTelefone(e.target.value)} type="tel" inputMode="tel" placeholder="Seu WhatsApp com DDD (é sua senha)"
            onKeyDown={e => e.key === 'Enter' && enviar()}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500" />
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <button onClick={enviar} disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-sm transition disabled:opacity-50">
            {busy ? 'Aguarde...' : cadastrando ? 'Quero ser VIP' : 'Entrar'}
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-6">
          Seu <b>WhatsApp</b> é a senha de acesso. {!cadastroAberto && 'Cadastro encerrado — só quem já é VIP acessa.'}
        </p>
      </div>
    </div>
  )
}
