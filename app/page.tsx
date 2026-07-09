'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { login, resetPassword } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, undefined)
  const [mode, setMode] = useState<'login' | 'reset'>('login')

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" fill="white" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">zivo</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {mode === 'login' ? 'Entre na sua conta' : 'Recuperar senha'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

          {mode === 'login' ? (
            <form action={action} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-zinc-300">E-mail</label>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  placeholder="seu@email.com"
                  className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-zinc-300">Senha</label>
                  <button type="button" onClick={() => setMode('reset')} className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer">
                    Esqueceu a senha?
                  </button>
                </div>
                <input
                  id="password" name="password" type="password" autoComplete="current-password" required
                  placeholder="••••••••"
                  className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {state?.error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  {state.error}
                </p>
              )}

              <button
                type="submit" disabled={pending}
                className="mt-1 w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition shadow-lg shadow-violet-500/20 cursor-pointer"
              >
                {pending ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          ) : (
            <form action={resetAction} className="flex flex-col gap-5">
              <p className="text-sm text-zinc-400">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reset-email" className="text-sm font-medium text-zinc-300">E-mail</label>
                <input
                  id="reset-email" name="email" type="email" required
                  placeholder="seu@email.com"
                  className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {resetState?.error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  {resetState.error}
                </p>
              )}
              {resetState?.success && (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2.5">
                  {resetState.success}
                </p>
              )}

              <button
                type="submit" disabled={resetPending}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition cursor-pointer"
              >
                {resetPending ? 'Enviando...' : 'Enviar link'}
              </button>

              <button type="button" onClick={() => setMode('login')} className="text-sm text-zinc-500 hover:text-zinc-300 transition cursor-pointer">
                ← Voltar para o login
              </button>
            </form>
          )}
        </div>

        {/* Rodapé */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Não tem uma conta?{' '}
          <Link href="/signup" className="text-violet-400 hover:text-violet-300 transition font-medium">
            Cadastre-se
          </Link>
        </p>

        <p className="text-center text-xs text-zinc-700 mt-4">
          <Link href="/termos" className="hover:text-zinc-500 transition">Termos de Uso</Link>
          {' · '}
          <Link href="/privacidade" className="hover:text-zinc-500 transition">Privacidade</Link>
        </p>
      </div>
    </main>
  )
}
