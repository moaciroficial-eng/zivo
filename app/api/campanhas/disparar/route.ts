import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage, normalizarTelefoneBR } from '@/lib/whatsapp'
import { resolverPublico } from '@/lib/inteligencia/campanhas'

export const maxDuration = 60
const MAX_ENVIOS = 300 /* proteção: não dispara milhares de uma vez */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { ocasiao, criterio, titulo, mensagem, objetivo, publico_descricao } = await request.json()
  if (!ocasiao || !criterio || !mensagem) {
    return NextResponse.json({ ok: false, erro: 'ocasião, critério e mensagem obrigatórios' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const publico = await resolverPublico(admin, user.id, ocasiao, criterio)
  const alvo = publico.slice(0, MAX_ENVIOS)

  /* Registra a campanha */
  const { data: campanha } = await admin.from('campanhas').insert({
    user_id: user.id,
    nome: titulo || 'Campanha',
    tipo: 'interna',
    objetivo: objetivo ?? null,
    segmento_descricao: publico_descricao ?? null,
    copy_whatsapp: mensagem,
    status: 'ativa',
  }).select('id').single()

  let enviados = 0
  for (const cli of alvo) {
    if (!cli.telefone) continue
    const primeiroNome = (cli.nome ?? '').split(' ')[0] || 'tudo bem'
    const texto = String(mensagem).replace(/\{nome\}/gi, primeiroNome)
    const phone = normalizarTelefoneBR(cli.telefone)

    let messageId: string | undefined
    try { messageId = (await sendWhatsAppMessage({ phone, message: texto })).messageId }
    catch { continue }

    /* Acha/cria o contato pra a resposta cair no atendimento */
    const last8 = phone.slice(-8)
    const { data: cands } = await admin
      .from('whatsapp_contatos').select('id').eq('user_id', user.id).ilike('phone', `%${last8}`)
    let contatoId = (cands ?? [])[0]?.id as string | undefined
    if (!contatoId) {
      const { data: novo } = await admin.from('whatsapp_contatos')
        .insert({ user_id: user.id, phone, nome: cli.nome, cliente_id: cli.id, funil_etapa: 'fundo', campanha_id: campanha?.id ?? null })
        .select('id').single()
      contatoId = novo?.id
    }

    const ts = new Date().toISOString()
    if (contatoId) {
      await admin.from('whatsapp_mensagens').insert({
        user_id: user.id, contato_id: contatoId, message_id: messageId ?? null,
        direcao: 'enviada', tipo: 'texto', conteudo: texto, status: 'enviada', timestamp: ts,
        raw: { origem: 'ia' },
      })
      await admin.from('whatsapp_contatos').update({ ultima_mensagem: texto, ultima_mensagem_at: ts }).eq('id', contatoId)
    }
    /* atribuição: registra o toque pra medir venda em até 7 dias */
    try {
      await admin.from('inteligencia_acoes').insert({ user_id: user.id, cliente_id: cli.id, mensagem: texto, enviada_em: ts })
    } catch { /* ignora */ }

    enviados++
  }

  return NextResponse.json({
    ok: true,
    enviados,
    total_publico: publico.length,
    excedente: publico.length > MAX_ENVIOS ? publico.length - MAX_ENVIOS : 0,
  })
}
