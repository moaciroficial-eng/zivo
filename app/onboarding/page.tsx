'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const STEPS = ['Sua loja', 'Endereço', 'Horário'] as const

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep]         = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [nomeLoja,   setNomeLoja]   = useState('')
  const [cidade,     setCidade]     = useState('')
  const [endereco,   setEndereco]   = useState('')
  const [horario,    setHorario]    = useState('Seg–Sex: 9h às 18h | Sáb: 9h às 13h')

  async function salvar() {
    setLoading(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { error } = await supabase.from('loja_config').upsert({
        user_id:   user.id,
        nome_loja: nomeLoja || undefined,
        endereco:  [cidade, endereco].filter(Boolean).join(' — ') || undefined,
        horario:   horario || undefined,
      }, { onConflict: 'user_id' })

      if (error) throw error
      router.push('/dashboard')
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const INPUT = 'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 w-full'

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" fill="white" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Bem-vindo ao Zivo!</h1>
          <p className="text-sm text-zinc-400 mt-1">Configure sua loja em 3 passos rápidos</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                i < step ? 'bg-violet-600 text-white' :
                i === step ? 'bg-violet-600 text-white ring-2 ring-violet-500/40' :
                'bg-zinc-800 text-zinc-500'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${i === step ? 'text-zinc-200' : 'text-zinc-600'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-zinc-800" />}
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="font-semibold text-white mb-1">Como se chama sua loja?</h2>
                <p className="text-sm text-zinc-500">Esse nome aparece para seus clientes no WhatsApp.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Nome da loja</label>
                <input value={nomeLoja} onChange={e => setNomeLoja(e.target.value)} placeholder="Ex: Moda Center" className={INPUT} />
              </div>
              <button
                onClick={() => setStep(1)} disabled={!nomeLoja.trim()}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition cursor-pointer"
              >
                Continuar →
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="font-semibold text-white mb-1">Onde fica sua loja?</h2>
                <p className="text-sm text-zinc-500">Usado quando o cliente perguntar o endereço no WhatsApp.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Cidade / Estado</label>
                <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: Barreiras, BA" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Endereço completo</label>
                <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Ex: Av. Paraná, 123 — Centro" className={INPUT} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition cursor-pointer">
                  ← Voltar
                </button>
                <button onClick={() => setStep(2)} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white font-semibold rounded-lg py-2.5 text-sm transition cursor-pointer">
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="font-semibold text-white mb-1">Qual o horário de funcionamento?</h2>
                <p className="text-sm text-zinc-500">O atendente do WhatsApp usa isso pra informar clientes.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">Horário</label>
                <input value={horario} onChange={e => setHorario(e.target.value)} className={INPUT} />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{error}</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition cursor-pointer">
                  ← Voltar
                </button>
                <button onClick={salvar} disabled={loading} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition cursor-pointer">
                  {loading ? 'Salvando...' : 'Entrar no Zivo →'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-700 mt-4">
          Você pode alterar tudo isso depois em Configurações.
        </p>
      </div>
    </main>
  )
}
