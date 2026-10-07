import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { logErro } from '@/lib/log-erro'

/* Webhook do Mercado Pago (assinatura recorrente). O MP avisa quando o
   pagamento é autorizado/pausado/cancelado; a gente atualiza o status da
   loja. Inerte até MP_ACCESS_TOKEN existir. Responde 200 sempre (o MP
   reenvia se não receber 200). */
export async function POST(request: NextRequest) {
  if (!process.env.MP_ACCESS_TOKEN) return NextResponse.json({ ok: true })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* MP às vezes manda via query */ }
  const tipo = (body.type as string) ?? request.nextUrl.searchParams.get('type')
  const id = (body.data as { id?: string } | undefined)?.id ?? request.nextUrl.searchParams.get('id')
  if (tipo !== 'preapproval' || !id) return NextResponse.json({ ok: true })

  try {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    })
    const d = await res.json().catch(() => ({})) as { status?: string; external_reference?: string; next_payment_date?: string }
    const userId = d.external_reference
    if (!userId) return NextResponse.json({ ok: true })

    /* authorized = ativa; paused = inadimplente; cancelled = cancelada */
    const status = d.status === 'authorized' ? 'ativa'
      : d.status === 'paused' ? 'inadimplente'
      : d.status === 'cancelled' ? 'cancelada'
      : null
    if (!status) return NextResponse.json({ ok: true })

    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    await admin.from('assinaturas').update({
      status,
      gateway_sub_id: String(id),
      proximo_vencimento: d.next_payment_date ?? null,
      atualizado_em: new Date().toISOString(),
    }).eq('user_id', userId)
  } catch (err) {
    await logErro('assinatura/webhook', err)
  }
  return NextResponse.json({ ok: true })
}
