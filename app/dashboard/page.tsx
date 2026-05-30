import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/actions/auth'
import AiChat from '@/app/components/AiChat'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const [{ count: totalClientes }, { data: vendasData }] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('vendas').select('valor'),
  ])

  const totalReceita = vendasData?.reduce((s, v) => s + Number(v.valor), 0) ?? 0

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="white" />
                </svg>
              </div>
              <span className="font-bold">zivo</span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <span className="px-3 py-1.5 font-medium bg-zinc-800 rounded-lg">Dashboard</span>
              <Link href="/clientes" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Clientes</Link>
              <Link href="/vendas" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Vendas</Link>
              <Link href="/calendario" className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Calendário</Link>
              <Link href="/estoque"   className="px-3 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition">Estoque</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition cursor-pointer">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Bem-vindo ao Dashboard</h1>
          <p className="text-zinc-400 mt-1">Autenticado como <span className="text-violet-400">{user.email}</span></p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/clientes" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Clientes</p>
            <p className="text-3xl font-bold mt-1">{totalClientes ?? 0}</p>
          </Link>
          <Link href="/vendas" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Receita Total</p>
            <p className="text-3xl font-bold mt-1 text-emerald-400">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceita)}
            </p>
          </Link>
          <Link href="/vendas" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 transition group">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">Vendas</p>
            <p className="text-3xl font-bold mt-1">{vendasData?.length ?? 0}</p>
          </Link>
        </div>
      </div>

      <AiChat />
    </main>
  )
}
