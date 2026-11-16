import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getLoja } from '@/lib/loja'
import { capitalizarPrimeiroNome, normalizarTelefoneBR, sendWhatsAppTemplate } from '@/lib/whatsapp'

/* "Enviar teste pra mim" -- manda o template pro número do PRÓPRIO lojista,
   pra ele conferir como chega no celular antes de disparar pra base.
   Não cria nenhum registro de disparo (é só uma prova, não conta como envio). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { templateName, extras } = await request.json().catch(() => ({})) as { templateName?: string; extras?: string[] }
  if (!templateName) return NextResponse.json({ ok: false, erro: 'Faltou o template.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)
  if (!loja?.ownerPhone) return NextResponse.json({ ok: false, erro: 'Cadastre seu telefone (owner_phone) nas configurações da loja pra receber o teste.' }, { status: 400 })

  const nomeDono = capitalizarPrimeiroNome(loja.nomeLoja, 'você')
  try {
    const { messageId } = await sendWhatsAppTemplate({
      phone: normalizarTelefoneBR(loja.ownerPhone),
      templateName,
      variaveis: [nomeDono, ...(extras ?? [])],
      creds: loja.creds,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, messageId })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar o teste.' }, { status: 502 })
  }
}
