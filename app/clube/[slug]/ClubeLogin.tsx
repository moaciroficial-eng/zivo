'use client'

import { useState } from 'react'

export default function ClubeLogin({ slug, nomeLoja, logo, cadastroAberto }: { slug: string; nomeLoja: string; logo: string | null; cadastroAberto: boolean }) {
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
    if (cadastrando && nome.trim().length < 2) { setErro('Digite seu nome.'); return }
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
    <div className="relative min-h-screen bg-[#07070a] text-white flex items-center justify-center p-6 overflow-hidden">
      {/* brilho de fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute left-1/2 bottom-[-15%] h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Cabeçalho: logo + selo */}
        <div className="text-center mb-6">
          {logo ? (
            <div className="mx-auto mb-4 h-24 w-24 rounded-2xl bg-black ring-1 ring-white/10 shadow-2xl shadow-violet-900/30 overflow-hidden flex items-center justify-center">
              <img src={logo} alt={nomeLoja} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-4xl shadow-2xl shadow-violet-900/40">👑</div>
          )}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">
            <span>👑</span> Clube VIP
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{nomeLoja}</h1>
          <p className="text-zinc-400 text-sm mt-1.5 leading-relaxed">
            {cadastrando
              ? 'Crie seu acesso e receba as ofertas secretas antes de todo mundo.'
              : 'Área exclusiva de membros. Entre pra ver as ofertas do clube.'}
          </p>
        </div>

        {/* Card do formulário */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5 shadow-xl">
          {/* Alternador de modo (só se o cadastro estiver aberto) */}
          {cadastroAberto && (
            <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 mb-4">
              <button onClick={() => { setModo('entrar'); setErro('') }} className={`flex-1 text-sm font-semibold rounded-lg py-2 transition ${!cadastrando ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}>Já sou VIP</button>
              <button onClick={() => { setModo('cadastrar'); setErro('') }} className={`flex-1 text-sm font-semibold rounded-lg py-2 transition ${cadastrando ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}>Criar acesso</button>
            </div>
          )}

          <div className="space-y-3 text-left">
            {cadastrando && (
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition" />
            )}
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email" placeholder="seu@email.com"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition" />
            <div>
              <input value={telefone} onChange={e => setTelefone(e.target.value)} type="tel" inputMode="tel" placeholder="Seu WhatsApp com DDD"
                onKeyDown={e => e.key === 'Enter' && enviar()}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition" />
              <p className="text-[11px] text-zinc-500 mt-1.5 ml-1">🔒 Seu WhatsApp é sua senha de acesso.</p>
            </div>
            {erro && <p className="text-sm text-red-400">{erro}</p>}
            <button onClick={enviar} disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-sm transition disabled:opacity-50 shadow-lg shadow-violet-900/30">
              {busy ? 'Aguarde...' : cadastrando ? 'Quero ser VIP 👑' : 'Entrar'}
            </button>
          </div>
        </div>

        {/* Benefícios */}
        <div className="mt-5 flex items-center justify-center gap-5 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">🏷️ Preços de VIP</span>
          <span className="flex items-center gap-1.5">⚡ Ofertas antes</span>
          <span className="flex items-center gap-1.5">🔒 Só membros</span>
        </div>

        {!cadastroAberto && (
          <p className="text-center text-xs text-zinc-600 mt-4">Cadastro encerrado — só quem já é VIP acessa.</p>
        )}
      </div>
    </div>
  )
}
