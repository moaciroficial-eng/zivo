import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cancelarNfce, ambienteDaLoja } from '@/lib/fiscal/focus'
import { logErro } from '@/lib/log-erro'

export const maxDuration = 60

/* Cancela o cupom (NFC-e) de uma venda. A SEFAZ exige justificativa de
   15–255 caracteres e só aceita dentro da janela de tempo (~30 min). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let vendaId: string | undefined
  let justificativa: string | undefined
  try { const b = await request.json(); vendaId = b.vendaId; justificativa = b.justificativa } catch { return new NextResponse('Invalid JSON', { status: 400 }) }
  if (!vendaId) return NextResponse.json({ ok: false, erro: 'vendaId obrigatório' }, { status: 400 })

  const just = (justificativa && justificativa.trim().length >= 15)
    ? justificativa.trim().slice(0, 255)
    : 'Cancelamento solicitado pelo emitente da nota.'

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await admin.from('loja_config').select('fiscal_ambiente').eq('user_id', user.id).maybeSingle()
  const amb = ambienteDaLoja(cfg?.fiscal_ambiente)
  const ref = `venda-${vendaId}`

  try {
    const r = await cancelarNfce(ref, just, amb)
    const d = r.data as { status?: string; mensagem_sefaz?: string; mensagem?: string; erros?: unknown }
    const cancelado = r.ok && d?.status === 'cancelado'

    if (cancelado) {
      await admin.from('notas_fiscais')
        .update({ status: 'cancelado', mensagem: d?.mensagem_sefaz ?? 'Cancelado', atualizado_em: new Date().toISOString() })
        .eq('user_id', user.id).eq('ref', ref)
      return NextResponse.json({ ok: true, status: 'cancelado' })
    }

    return NextResponse.json({
      ok: false,
      mensagem: d?.mensagem_sefaz ?? d?.mensagem ?? (d?.erros ? JSON.stringify(d.erros) : 'Não foi possível cancelar (verifique se ainda está dentro do prazo).'),
    })
  } catch (err) {
    await logErro('fiscal/cancelar', err, { vendaId }, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}
