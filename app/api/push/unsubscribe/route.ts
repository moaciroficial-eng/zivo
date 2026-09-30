import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Remove a inscrição push deste dispositivo (dono desligou os avisos). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let endpoint: string | undefined
  try { endpoint = (await request.json())?.endpoint } catch { /* ignore */ }

  const q = supabase.from('push_subscriptions').delete().eq('user_id', user.id)
  if (endpoint) await q.eq('endpoint', endpoint)
  else await q // sem endpoint: limpa todas as deste dono

  return NextResponse.json({ ok: true })
}
