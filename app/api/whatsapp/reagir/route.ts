import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { reactWhatsApp } from '@/lib/whatsapp'
import { NextRequest, NextResponse } from 'next/server'

/* Reage a uma mensagem do cliente com um emoji (via Meta). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let contatoId: string, messageId: string, emoji: string
  try {
    const body = await request.json()
    contatoId = body.contatoId
    messageId = body.messageId
    emoji     = body.emoji ?? ''
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!contatoId || !messageId) return new NextResponse('contatoId e messageId obrigatórios', { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: contato } = await admin.from('whatsapp_contatos').select('phone').eq('id', contatoId).eq('user_id', user.id).maybeSingle()
  if (!contato?.phone) return new NextResponse('Contato não encontrado', { status: 404 })

  try {
    await reactWhatsApp({ phone: contato.phone, messageId, emoji, userId: user.id })
  } catch (err) {
    console.error('Erro ao reagir:', err)
    return new NextResponse(String(err), { status: 500 })
  }

  /* Registra a reação como notinha no histórico (direção enviada) */
  try {
    await admin.from('whatsapp_mensagens').insert({
      user_id: user.id, contato_id: contatoId, direcao: 'enviada',
      tipo: 'reacao', conteudo: emoji ? `reagiu ${emoji}` : 'removeu a reação',
      status: 'enviada', timestamp: new Date().toISOString(),
    })
  } catch { /* não falha a reação se o registro falhar */ }

  return NextResponse.json({ ok: true })
}
