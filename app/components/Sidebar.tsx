'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'

const NAV = [
  {
    section: 'Principal',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Vendas',
    items: [
      {
        href: '/vendas',
        label: 'Vendas',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        ),
      },
      {
        href: '/calendario',
        label: 'Calendário',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        ),
      },
      {
        href: '/campanhas',
        label: 'Campanhas',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Estoque',
    items: [
      {
        href: '/estoque',
        label: 'Estoque',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        ),
      },
      {
        href: '/biblioteca',
        label: 'Biblioteca',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        ),
      },
      {
        href: '/compras',
        label: 'Compras',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Clientes',
    items: [
      {
        href: '/clientes',
        label: 'Clientes',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
      {
        href: '/ia',
        label: 'IA',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.663 17h4.673M12 3a6 6 0 0 1 6 6c0 2.12-1.1 3.978-2.75 5.05L15 17H9l-.25-2.95A6.002 6.002 0 0 1 6 9a6 6 0 0 1 6-6z"/><line x1="12" y1="21" x2="12" y2="17"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Configurações',
    items: [
      {
        href: '/configuracoes/loja',
        label: 'Loja',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        ),
      },
      {
        href: '/configuracoes/marcas',
        label: 'Marcas',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
        ),
      },
      {
        href: '/whatsapp',
        label: 'WhatsApp',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        ),
      },
    ],
  },
]

function NavItem({ href, label, icon, badge, onClick }: {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
  onClick?: () => void
}) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      onClick={onClick}
      title={label}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group ${
        active
          ? 'bg-[#3B6FFF]/12 text-[#7FA8FF] shadow-[inset_0_0_0_1px_rgba(59,111,255,0.18)]'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
      }`}
    >
      <span className={`shrink-0 transition-colors ${active ? 'text-[#3B6FFF]' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
        {icon}
      </span>
      {label}
      {badge && badge > 0
        ? <span className="ml-auto min-w-[18px] h-[18px] bg-[#00D4AA] text-[#080B10] text-[10px] font-bold rounded-full flex items-center justify-center px-1 shrink-0">{badge > 99 ? '99+' : badge}</span>
        : active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00D4AA] shrink-0" />
      }
    </Link>
  )
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [waNaoLidas, setWaNaoLidas] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? '')
      if (!data.user) return
      /* Total de mensagens não lidas */
      const { data: rows } = await supabase
        .from('whatsapp_contatos')
        .select('nao_lidas')
        .eq('user_id', data.user.id)
      const total = (rows ?? []).reduce((s, r) => s + ((r.nao_lidas as number) ?? 0), 0)
      setWaNaoLidas(total)
      /* Realtime para atualizar badge */
      supabase.channel('sidebar-wa')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contatos' }, async () => {
          const { data: fresh } = await supabase.from('whatsapp_contatos').select('nao_lidas').eq('user_id', data.user!.id)
          setWaNaoLidas((fresh ?? []).reduce((s, r) => s + ((r.nao_lidas as number) ?? 0), 0))
        })
        .subscribe()
    })
  }, [])

  return (
    <aside
      className={`sidebar-drawer ${open ? 'sidebar-open' : ''} fixed top-0 left-0 h-screen w-60 z-40 flex flex-col bg-[#080B10] border-r border-zinc-800/40 transition-transform duration-300 ease-in-out`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-zinc-800/60 shrink-0">
        <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2.5 group">
          {/* Logo: ponto pulsante */}
          <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
            <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-[#00D4AA] zivo-dot-ring" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00D4AA] zivo-dot-core" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">zivo</span>
        </Link>
        <button
          onClick={onClose}
          className="md:hidden p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-1.5 select-none">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map(item => (
                <NavItem
                  key={item.href}
                  {...item}
                  onClick={onClose}
                  badge={item.href === '/whatsapp' ? waNaoLidas : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-zinc-800/60 px-3 py-3 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[#3B6FFF]/20 border border-[#3B6FFF]/30 flex items-center justify-center text-xs font-bold text-[#7FA8FF] shrink-0">
            {email ? email.charAt(0).toUpperCase() : '?'}
          </div>
          <p className="text-xs text-zinc-400 truncate flex-1 min-w-0">{email}</p>
          <form action={logout}>
            <button
              type="submit"
              title="Sair"
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition cursor-pointer shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
