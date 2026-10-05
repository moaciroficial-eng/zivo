'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/* Card do WhatsApp no dashboard: mostra quantas conversas têm mensagem
   não lida ("pra abrir") e pisca quando tem algo novo. Atualiza ao vivo
   (realtime) quando chega mensagem. */
export default function WhatsAppStatusCard() {
  const [conversas, setConversas] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let canal: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      const uid = data.user.id
      const carregar = async () => {
        const { data: rows } = await supabase
          .from('whatsapp_contatos')
          .select('nao_lidas')
          .eq('user_id', uid)
        setConversas((rows ?? []).filter(r => ((r.nao_lidas as number) ?? 0) > 0).length)
      }
      carregar()
      canal = supabase.channel('dash-wa')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contatos' }, carregar)
        .subscribe()
    })
    return () => { if (canal) canal.unsubscribe() }
  }, [])

  const tem = conversas > 0

  return (
    <Link
      href="/whatsapp"
      className={`bg-zinc-900/80 border rounded-2xl p-5 transition group flex flex-col justify-between ${tem ? 'border-[#00D4AA]/50' : 'border-zinc-800/60 hover:border-zinc-700'}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition">WhatsApp</p>
        {tem && <span className="w-2.5 h-2.5 rounded-full bg-[#00D4AA] animate-pulse" />}
      </div>
      <div className="flex items-end justify-between mt-1">
        {tem ? (
          <div>
            <p className="text-3xl font-bold text-[#00D4AA] leading-none">{conversas}</p>
            <p className="text-xs text-zinc-400 mt-1">{conversas === 1 ? 'conversa pra abrir' : 'conversas pra abrir'}</p>
          </div>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition self-end">Abrir chat →</span>
      </div>
    </Link>
  )
}
