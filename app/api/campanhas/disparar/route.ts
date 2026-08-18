import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizarTelefoneBR } from '@/lib/whatsapp'
import { enviarOferta } from '@/lib/agentes/envio'
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

  /* Nome da loja pra moldura de template (janela fechada) */
  const { data: cfgLoja } = await admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle()
  const nomeLoja = (cfgLoja as { nome_loja?: string } | null)?.nome_loja || 'a loja'

  let enviados = 0
  for (const cli of alvo) {
    if (!cli.telefone) continue
    const primeiroNome = (cli.nome ?? '').split(' ')[0] || 'tudo bem'
    const texto = String(mensagem).replace(/\{nome\}/gi, primeiroNome)
    const phone = normalizarTelefoneBR(cli.telefone)

    /* Acha/cria o contato ANTES do envio — o enviarOferta usa ele pra checar
       a janela de 24h (aberta = texto livre; fechada = moldura novidade_loja). */
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

    /* enviarOferta já grava o histórico do chat e cai na moldura quando frio,
       então nenhuma mensagem "some" pra quem está fora da janela de 24h. */
    const r = await enviarOferta(admin, {
      userId: user.id,
      contatoId: contatoId ?? null,
      phone,
      texto,
      templateName: 'novidade_loja',
      templateVars: [primeiroNome, nomeLoja, texto],
    })
    if (!r.ok) continue

    /* atribuição: registra o toque pra medir venda em até 7 dias */
    try {
      await admin.from('inteligencia_acoes').insert({ user_id: user.id, cliente_id: cli.id, mensagem: texto, enviada_em: new Date().toISOString() })
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
