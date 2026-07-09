import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const maxDuration = 60

/* Próximo domingo (fim de semana do cupom) */
function proximoDomingo(ref: Date): Date {
  const d = new Date(ref)
  const dia = d.getDay() // 0=dom, 6=sab
  const diasAte = dia === 0 ? 7 : 7 - dia
  d.setDate(d.getDate() + diasAte)
  return d
}

function fmtData(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

async function enviarEHistorico(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  clienteId: string,
  phone: string,
  mensagem: string,
) {
  await sendWhatsAppMessage({ phone, message: mensagem })

  const { data: contato } = await admin
    .from('whatsapp_contatos').select('id')
    .eq('user_id', userId).eq('phone', phone).maybeSingle()

  if (contato?.id) {
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contato.id,
      direcao: 'enviada', tipo: 'texto',
      conteudo: mensagem, status: 'enviada', timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: mensagem, ultima_mensagem_at: timestamp,
    }).eq('id', contato.id)
  }
}

export async function GET() {
  const userId = (process.env.WHATSAPP_USER_ID ?? '').replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ ok: false, error: 'WHATSAPP_USER_ID não configurado' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date()
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  const domingo = proximoDomingo(hoje)
  const domingoStr = fmtData(domingo)

  const hojeM  = hoje.getMonth() + 1
  const hojeD  = hoje.getDate()
  const amanhaM = amanha.getMonth() + 1
  const amanhaD = amanha.getDate()
  const anoAtual = hoje.getFullYear()

  const { data: config } = await admin
    .from('loja_config').select('nome_loja, desconto_aniversario').eq('user_id', userId).maybeSingle()
  const nomeLoja = config?.nome_loja || 'Moca'
  const desconto = config?.desconto_aniversario ?? 40

  /* Busca todos os clientes (com ou sem nascimento, para checar dependentes também) */
  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nome, telefone, data_nascimento, dependentes')
    .eq('user_id', userId)

  let enviadas = 0

  for (const cliente of clientes ?? []) {
    if (!cliente.data_nascimento) continue
    const nasc = new Date(cliente.data_nascimento)
    const nascM = nasc.getUTCMonth() + 1
    const nascD = nasc.getUTCDate()

    const ehHoje   = nascM === hojeM   && nascD === hojeD
    const ehAmanha = nascM === amanhaM && nascD === amanhaD

    if (!ehHoje && !ehAmanha) continue

    /* Busca contato WhatsApp */
    let phone: string | null = null
    const { data: wa } = await admin
      .from('whatsapp_contatos').select('phone')
      .eq('user_id', userId).eq('cliente_id', cliente.id).maybeSingle()
    if (wa?.phone) {
      phone = wa.phone
    } else if (cliente.telefone) {
      const last = cliente.telefone.replace(/\D/g, '').slice(-8)
      const { data: wa2 } = await admin
        .from('whatsapp_contatos').select('phone')
        .eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
      if (wa2?.phone) phone = wa2.phone
    }

    if (!phone) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'

    /* Garante registro do cupom para este ano */
    const { data: cupom } = await admin
      .from('aniversario_cupons')
      .upsert({
        user_id: userId, cliente_id: cliente.id,
        ano: anoAtual, validade: domingo.toISOString().split('T')[0],
        desconto,
      }, { onConflict: 'user_id,cliente_id,ano', ignoreDuplicates: false })
      .select().single()

    const cupomRow = cupom ?? (await admin
      .from('aniversario_cupons')
      .select('*').eq('user_id', userId).eq('cliente_id', cliente.id).eq('ano', anoAtual)
      .single()).data

    if (!cupomRow) continue

    /* Dia anterior ao aniversário */
    if (ehAmanha && !cupomRow.msg_pre_enviada) {
      const msg = `Oi ${nome}! Amanhã é seu aniversário e temos um presente pra você 🎁\n\nVocê está ganhando um cupom de *${desconto}% de desconto* válido até ${domingoStr}.\n\nÉ só me chamar aqui e dizer que veio buscar o presente! 😊\n\n${nomeLoja}`
      await enviarEHistorico(admin, userId, cliente.id, phone, msg)
      await admin.from('aniversario_cupons').update({ msg_pre_enviada: true }).eq('id', cupomRow.id)
      enviadas++
    }

    /* Dia do aniversário */
    if (ehHoje && !cupomRow.msg_dia_enviada) {
      const msg = `Feliz aniversário, ${nome}! 🎉🎂\n\nQue seu dia seja incrível! Lembra do seu cupom de *${desconto}% de desconto*? Válido até ${domingoStr}.\n\nÉ só me chamar 😊\n\n${nomeLoja}`
      await enviarEHistorico(admin, userId, cliente.id, phone, msg)
      await admin.from('aniversario_cupons').update({ msg_dia_enviada: true }).eq('id', cupomRow.id)
      enviadas++
    }
  }

  /* Aniversários de dependentes — avisa a cliente titular */
  const hojeIso = hoje.toISOString().split('T')[0]
  for (const cliente of clientes ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = ((cliente.dependentes ?? []) as any[]).filter(d => d.data_nascimento)
    if (!deps.length) continue

    /* Busca phone uma única vez por cliente */
    let phone: string | null = null
    const { data: wa } = await admin
      .from('whatsapp_contatos').select('phone, id')
      .eq('user_id', userId).eq('cliente_id', cliente.id).maybeSingle()
    if (wa?.phone) {
      phone = wa.phone
    } else if (cliente.telefone) {
      const last = cliente.telefone.replace(/\D/g, '').slice(-8)
      const { data: wa2 } = await admin
        .from('whatsapp_contatos').select('phone, id')
        .eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
      if (wa2?.phone) phone = wa2.phone
    }
    if (!phone) continue

    const contatoId = wa?.id ?? null
    const nomeCliente = cliente.nome?.split(' ')[0] ?? 'você'

    for (const dep of deps) {
      const nascDep = new Date(dep.data_nascimento)
      const nascDepM = nascDep.getUTCMonth() + 1
      const nascDepD = nascDep.getUTCDate()

      const depHoje   = nascDepM === hojeM   && nascDepD === hojeD
      const depAmanha = nascDepM === amanhaM && nascDepD === amanhaD
      if (!depHoje && !depAmanha) continue

      /* Evita reenvio checando mensagens de hoje para este contato com o nome do dep */
      if (contatoId) {
        const { data: jaEnviou } = await admin
          .from('whatsapp_mensagens')
          .select('id')
          .eq('user_id', userId)
          .eq('contato_id', contatoId)
          .gte('timestamp', `${hojeIso}T00:00:00.000Z`)
          .ilike('conteudo', `%${dep.nome.split(' ')[0]}%`)
          .limit(1).maybeSingle()
        if (jaEnviou) continue
      }

      const nomeDepPrimeiro = dep.nome?.split(' ')[0] ?? dep.nome
      const relacao = dep.relacao as string // marido, pai, filho, filha

      if (depAmanha) {
        const msg = `Oi ${nomeCliente}! Amanhã é o aniversário do seu ${relacao} ${nomeDepPrimeiro} 🎂\n\nQue tal um presente especial? Use *${desconto}% de desconto* aqui na ${nomeLoja} até ${domingoStr}!\n\nÉ só me chamar 😊`
        await enviarEHistorico(admin, userId, cliente.id, phone, msg)
        enviadas++
      }

      if (depHoje) {
        const msg = `Oi ${nomeCliente}! Hoje é aniversário do ${relacao} ${nomeDepPrimeiro}! 🎉\n\nVenham comemorar com *${desconto}% de desconto* aqui na ${nomeLoja}, válido até ${domingoStr}!\n\nÉ só me chamar 😊`
        await enviarEHistorico(admin, userId, cliente.id, phone, msg)
        enviadas++
      }
    }
  }

  /* Lembrete de vencimento: cupons que vencem amanhã e lembrete ainda não enviado */
  const { data: vencendo } = await admin
    .from('aniversario_cupons')
    .select('id, cliente_id, validade')
    .eq('user_id', userId)
    .eq('msg_lembrete_enviada', false)
    .eq('validade', amanha.toISOString().split('T')[0])

  for (const cupom of vencendo ?? []) {
    const { data: cliente } = await admin
      .from('clientes').select('nome, telefone').eq('id', cupom.cliente_id).single()
    if (!cliente) continue

    let phone: string | null = null
    const { data: wa } = await admin
      .from('whatsapp_contatos').select('phone')
      .eq('user_id', userId).eq('cliente_id', cupom.cliente_id).maybeSingle()
    if (wa?.phone) phone = wa.phone

    if (!phone && cliente.telefone) {
      const last = cliente.telefone.replace(/\D/g, '').slice(-8)
      const { data: wa2 } = await admin
        .from('whatsapp_contatos').select('phone')
        .eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
      if (wa2?.phone) phone = wa2.phone
    }

    if (!phone) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const msg = `Oi ${nome}! Seu cupom de aniversário de *${desconto}% de desconto* vence amanhã ⏰\n\nAinda dá tempo de usar, é só me chamar 😊\n\n${nomeLoja}`
    await enviarEHistorico(admin, userId, cupom.cliente_id, phone, msg)
    await admin.from('aniversario_cupons').update({ msg_lembrete_enviada: true }).eq('id', cupom.id)
    enviadas++
  }

  return NextResponse.json({ ok: true, enviadas })
}
