'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ResetForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)
  const [ready, setReady]         = useState(false)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) { setError('Link inválido ou expirado.'); return }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setError('Link inválido ou expirado. Solicite um novo.')
      else setReady(true)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    if (password.length < 6)  { setError('A senha deve ter pelo menos 6 caracteres.'); return }

    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError('Erro ao atualizar a senha. Tente novamente.'); return }
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" fill="white" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">zivo</h1>
          <p className="text-sm text-zinc-400 mt-1">Redefinir senha</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {success ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-white font-semibold">Senha atualizada!</p>
              <p className="text-sm text-zinc-400">Redirecionando para o dashboard...</p>
            </div>
          ) : error && !ready ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-400">{error}</p>
              <a href="/" className="text-sm text-violet-400 hover:text-violet-300 transition">← Voltar para o login</a>
            </div>
          ) : ready ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Nova senha</label>
                <input
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Confirmar senha</label>
                <input
                  type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{error}</p>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition cursor-pointer"
              >
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-400 text-center">Verificando link...</p>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  )
}
