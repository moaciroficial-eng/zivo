'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/* Barra de abas inferior — só no celular (lg:hidden). Dá cara de app:
   os destinos mais usados sempre à mão, e "Mais" abre o menu completo. */

const Home = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const Cifrao = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)
const Chat = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const Users = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const Mais = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const TABS = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/vendas', label: 'Vendas', icon: Cifrao },
  { href: '/whatsapp', label: 'WhatsApp', icon: Chat, badge: true },
  { href: '/clientes', label: 'Clientes', icon: Users },
]

export default function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()
  const [naoLidas, setNaoLidas] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let canal: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const somar = (rows: { nao_lidas: number | null }[] | null) =>
        (rows ?? []).reduce((s, r) => s + (r.nao_lidas ?? 0), 0)
      const { data: rows } = await supabase.from('whatsapp_contatos').select('nao_lidas').eq('user_id', data.user.id)
      setNaoLidas(somar(rows))
      canal = supabase.channel('tabbar-wa')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contatos' }, async () => {
          const { data: fresh } = await supabase.from('whatsapp_contatos').select('nao_lidas').eq('user_id', data.user!.id)
          setNaoLidas(somar(fresh))
        })
        .subscribe()
    })
    return () => { if (canal) canal.unsubscribe() }
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0B0B0D]/95 backdrop-blur-xl border-t border-zinc-800/60 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação"
    >
      <div className="flex items-stretch">
        {TABS.map((t) => {
          const active = isActive(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[58px] transition-colors ${
                active ? 'text-[#E0B36A]' : 'text-zinc-500'
              }`}
            >
              <span className="relative">
                {t.icon}
                {t.badge && naoLidas > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-[#00D4AA] text-[#080B10] text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
            </Link>
          )
        })}
        <button
          onClick={onMore}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[58px] text-zinc-500 active:text-zinc-300 transition-colors"
        >
          {Mais}
          <span className="text-[10px] font-medium leading-none">Mais</span>
        </button>
      </div>
    </nav>
  )
}
