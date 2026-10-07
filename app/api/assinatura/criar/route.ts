import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { PLANOS, cobrancaConfigurada, garantirAssinatura, type PlanoId } from '@/lib/assinatura'
import { logErro } from '@/lib/log-erro'

/* Cria a assinatura recorrente no gateway (Mercado Pago preapproval) e
   devolve o link de checkout. Enquanto MP_ACCESS_TOKEN não existir, responde
   "ainda não configurada" (o botão mostra "em breve"). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let plano: PlanoId
  try { plano = (await request.json()).plano } catch { return new NextResponse('Invalid JSON', { status: 400 }) }
  if (plano !== 'essencial' && plano !== 'pro') {
    return NextResponse.json({ ok: false, erro: 'Plano inválido.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await garantirAssinatura(admin, user.id)
  // registra o plano escolhido (status só vira "ativa" quando o gateway confirmar)
  await admin.from('assinaturas').update({ plano, gateway: 'mercadopago', atualizado_em: new Date().toISOString() }).eq('user_id', user.id)

  if (!cobrancaConfigurada()) {
    return NextResponse.json({ ok: false, erro: 'A cobrança ainda não está ativa (estamos finalizando). Em breve!' })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  try {
    const res = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `Terny — plano ${PLANOS[plano].nome}`,
        external_reference: user.id,
        payer_email: user.email,
        back_url: `${base}/assinatura?ok=1`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PLANOS[plano].preco,
          currency_id: 'BRL',
        },
        status: 'pending',
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.init_point) {
      await logErro('assinatura/criar', new Error('MP falhou'), { d }, user.id)
      return NextResponse.json({ ok: false, erro: 'Não consegui iniciar a assinatura. Tente de novo.' }, { status: 502 })
    }
    if (d.id) await admin.from('assinaturas').update({ gateway_sub_id: String(d.id) }).eq('user_id', user.id)
    return NextResponse.json({ ok: true, url: d.init_point })
  } catch (err) {
    await logErro('assinatura/criar', err, { plano }, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}
