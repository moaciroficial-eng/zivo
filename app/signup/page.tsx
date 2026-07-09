'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signup } from '@/app/actions/auth'

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined)

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-4 py-12">
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
          <p className="text-sm text-zinc-400 mt-1">Crie sua conta gratuitamente</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <form action={action} className="flex flex-col gap-5">

            <div className="flex flex-col gap-1.5">
              <label htmlFor="nome_loja" className="text-sm font-medium text-zinc-300">Nome da loja</label>
              <input
                id="nome_loja" name="nome_loja" type="text" required
                placeholder="Ex: Moda Center"
                className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">E-mail</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                placeholder="seu@email.com"
                className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">Senha</label>
              <input
                id="password" name="password" type="password" autoComplete="new-password" required
                placeholder="Mínimo 6 caracteres"
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
              {pending ? 'Criando conta...' : 'Criar conta'}
            </button>

            <p className="text-xs text-zinc-600 text-center leading-relaxed">
              Ao criar uma conta você concorda com nossos{' '}
              <Link href="/termos" className="text-zinc-400 hover:text-zinc-300 underline">Termos de Uso</Link>
              {' '}e{' '}
              <Link href="/privacidade" className="text-zinc-400 hover:text-zinc-300 underline">Política de Privacidade</Link>.
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Já tem uma conta?{' '}
          <Link href="/" className="text-violet-400 hover:text-violet-300 transition font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
