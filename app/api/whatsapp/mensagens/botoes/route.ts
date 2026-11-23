import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendWhatsAppButtons, sendWhatsAppList } from '@/lib/whatsapp'
import { getLoja } from '@/lib/loja'
import { NextRequest, NextResponse } from 'next/server'

/* Envio MANUAL de botões/lista pelo dono (item 4) -- diferente da qualificação
   automática, aqui não marca raw.origem (é o dono decidindo, não a IA). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let phone: string, contatoId: string | undefined, corpo: string, tipo: 'botoes' | 'lista', opcoes: string[]
  try {
    const body = await request.json()
    phone = body.phone
    contatoId = body.contatoId
    corpo = body.corpo
    tipo = body.tipo
    opcoes = Array.isArray(body.opcoes) ? body.opcoes.filter((o: unknown) => typeof o === 'string' && o.trim()) : []
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!phone || !corpo?.trim() || opcoes.length === 0) return new NextResponse('Dados inválidos.', { status: 400 })
  if (tipo === 'botoes' && opcoes.length > 3) return new NextResponse('Botões aceitam no máximo 3 opções.', { status: 400 })
  if (tipo === 'lista' && opcoes.length > 10) return new NextResponse('Lista aceita no máximo 10 opções.', { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)

  let messageId: string | undefined
  try {
    if (tipo === 'botoes') {
      ({ messageId } = await sendWhatsAppButtons({
        phone, corpo, botoes: opcoes.map((titulo, i) => ({ id: `manual_${i}`, titulo })), creds: loja?.creds, userId: user.id,
      }))
    } else {
      ({ messageId } = await sendWhatsAppList({
        phone, corpo, textoBotao: 'Escolher', linhas: opcoes.map((titulo, i) => ({ id: `manual_${i}`, titulo })), creds: loja?.creds, userId: user.id,
      }))
    }
  } catch (err) {
    return new NextResponse(String(err), { status: 500 })
  }

  try {
    let cId = contatoId
    if (!cId) {
      const normalized = phone.replace(/\D/g, '')
      const number = normalized.startsWith('55') ? normalized : `55${normalized}`
      const { data: c } = await admin.from('whatsapp_contatos').select('id').eq('user_id', user.id).eq('phone', number).maybeSingle()
      cId = c?.id
    }
    if (cId) {
      const timestamp = new Date().toISOString()
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id, contato_id: cId, message_id: messageId ?? null,
        direcao: 'enviada', tipo: 'texto', conteudo: corpo, status: 'enviada', timestamp,
        raw: { interativo: { tipo, opcoes } },
      })
      await admin.from('whatsapp_contatos').update({ ultima_mensagem: corpo, ultima_mensagem_at: timestamp }).eq('id', cId)
    }
  } catch { /* histórico é secundário -- não derruba o envio */ }

  return NextResponse.json({ ok: true })
}
