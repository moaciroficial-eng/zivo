import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p className="text-6xl font-bold text-zinc-800 mb-2">404</p>
        <h1 className="text-xl font-semibold mb-2">Página não encontrada</h1>
        <p className="text-zinc-500 text-sm mb-8">A página que você procura não existe ou foi removida.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition"
        >
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  )
}
