import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logErro } from '@/lib/log-erro'

/* Salva a inscrição push do dispositivo do dono. Uma por navegador/aparelho
   (endpoint único). Reenviar atualiza as chaves. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const { subscription } = await request.json()
    const endpoint = subscription?.endpoint as string | undefined
    const p256dh = subscription?.keys?.p256dh as string | undefined
    const auth = subscription?.keys?.auth as string | undefined
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, erro: 'Inscrição inválida' }, { status: 400 })
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint, p256dh, auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    }, { onConflict: 'user_id,endpoint' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    await logErro('push/subscribe', err, undefined, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}
