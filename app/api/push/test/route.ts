import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarPushParaUsuario, pushConfigurado } from '@/lib/push'

/* Envia um aviso de teste pro próprio dono — usado pelo botão "Testar". */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  if (!pushConfigurado()) {
    return NextResponse.json({ ok: false, erro: 'Falta configurar VAPID_PRIVATE_KEY no servidor.' })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const r = await enviarPushParaUsuario(admin, user.id, {
    title: 'Terny ✓',
    body: 'Avisos ligados! Você vai receber aqui quando chegar mensagem ou venda.',
    url: '/dashboard',
    tag: 'terny-teste',
  })
  return NextResponse.json({ ok: r.enviadas > 0, ...r })
}
