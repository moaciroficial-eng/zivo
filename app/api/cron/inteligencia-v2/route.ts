import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { clienteServeProduto } from '@/lib/tamanhos'

export const maxDuration = 60

/* ── Helpers ─────────────────────────────────────────────── */

function diasEntre(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function mesStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function enviarWpp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  clienteId: string,
  phone: string,
  mensagem: string,
) {
  const { messageId } = await sendWhatsAppMessage({ phone, message: mensagem })
  const { data: contato } = await admin
    .from('whatsapp_contatos').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle()
  if (contato?.id) {
    const ts = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contato.id, message_id: messageId ?? null,
      direcao: 'enviada', tipo: 'texto', conteudo: mensagem, status: 'enviada', timestamp: ts,
      raw: { origem: 'ia' },
    })
    await admin.from('whatsapp_contatos').update({ ultima_mensagem: mensagem, ultima_mensagem_at: ts }).eq('id', contato.id)
  }
  /* Registra ação pra evitar duplo disparo */
  try {
    await admin.from('inteligencia_acoes').insert({ user_id: userId, cliente_id: clienteId, mensagem, enviada_em: new Date().toISOString() })
  } catch { /* ignora */ }
}

/* Cria SUGESTÃO pendente na aba Ações — o dono aprova antes de enviar.
   Nenhuma mensagem proativa sai sem autorização (exceto aniversários). */
async function criarSugestao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  cliente: { id: string; nome: string | null },
  contatoId: string,
  tipo: string,
  titulo: string,
  descricao: string,
  mensagem: string,
): Promise<boolean> {
  /* Dedupe: já sugeriu pra esse cliente nos últimos 14 dias (qualquer status)? */
  const desde = new Date()
  desde.setDate(desde.getDate() - 14)
  const { data: existentes } = await admin
    .from('agente_sugestoes')
    .select('id')
    .eq('user_id', userId)
    .eq('acao->>cliente_id', cliente.id)
    .gte('created_at', desde.toISOString())
    .limit(1)
  if ((existentes?.length ?? 0) > 0) return false

  const { error } = await admin.from('agente_sugestoes').insert({
    user_id: userId,
    tipo,
    titulo,
    descricao,
    prioridade: 2,
    status: 'pendente',
    acao: {
      tipo: 'enviar_mensagem',
      cliente_id: cliente.id,
      contato_id: contatoId,
      clientes: [cliente.nome ?? 'Cliente'],
      sugestao_mensagem: mensagem,
    },
  })
  return !error
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarContato(admin: any, userId: string, clienteId: string, telefone?: string | null) {
  const r1 = await admin.from('whatsapp_contatos').select('id, phone').eq('user_id', userId).eq('cliente_id', clienteId).maybeSingle()
  const wa = r1.data as { id: string; phone: string } | null
  if (wa?.phone) return wa
  if (telefone) {
    const last = telefone.replace(/\D/g, '').slice(-8)
    const r2 = await admin.from('whatsapp_contatos').select('id, phone').eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
    const wa2 = r2.data as { id: string; phone: string } | null
    if (wa2?.phone) return wa2
  }
  return null
}

/* Verifica se já enviou mensagem pra esse cliente nos últimos N dias */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jaEnviouRecente(admin: any, userId: string, clienteId: string, diasMinimos: number) {
  const desde = new Date()
  desde.setDate(desde.getDate() - diasMinimos)
  const r = await admin.from('inteligencia_acoes')
    .select('id').eq('user_id', userId).eq('cliente_id', clienteId)
    .gte('enviada_em', desde.toISOString()).limit(1)
  const rows = r.data as unknown[] | null
  return (rows?.length ?? 0) > 0
}

export async function GET(request: NextRequest) {
  /* Só a Vercel (cron) pode chamar quando CRON_SECRET está configurado */
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const userId = (process.env.WHATSAPP_USER_ID ?? '').replace(/^﻿/, '').trim()
  if (!userId) return NextResponse.json({ ok: false, error: 'WHATSAPP_USER_ID ausente' })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date()
  const hojeStr = hoje.toISOString().split('T')[0]

  const { data: config } = await admin.from('loja_config').select('nome_loja, desconto_aniversario').eq('user_id', userId).maybeSingle()
  const nomeLoja = config?.nome_loja || 'Moca'

  /* ── Carrega todos os dados ─────────────────────────────── */
  const [{ data: todasVendas }, { data: todosClientes }, { data: todoEstoque }] = await Promise.all([
    admin.from('vendas')
      .select('id,cliente_id,cliente_nome,valor,data_venda,produtos,presente,tipo_presente,presente_tamanho')
      .eq('user_id', userId).order('data_venda', { ascending: true }),
    admin.from('clientes')
      .select('id,nome,telefone,tamanho_camiseta,tamanho_calca,tamanho_tenis,data_nascimento')
      .eq('user_id', userId),
    admin.from('estoque')
      .select('id,nome,marca,tamanhos,preco_venda,data_entrada,categoria')
      .eq('user_id', userId),
  ])

  const vendas = todasVendas ?? []
  const clientes = todosClientes ?? []
  const estoque = todoEstoque ?? []

  /* ── Por cliente: vendas agrupadas ─────────────────────── */
  type VendaRow = typeof vendas[number]
  const vendasPorCliente = new Map<string, VendaRow[]>()
  for (const v of vendas) {
    if (!v.cliente_id) continue
    if (!vendasPorCliente.has(v.cliente_id)) vendasPorCliente.set(v.cliente_id, [])
    vendasPorCliente.get(v.cliente_id)!.push(v)
  }

  let enviadas = 0   /* apenas aniversários (único envio automático permitido) */
  let sugeridas = 0  /* demais categorias viram sugestões pra aprovação do dono */
  const MAX_ENVIOS = 5     /* Limite por rodada pra não spammar */
  const MAX_SUGESTOES = 10 /* Limite de sugestões novas por rodada */

  /* ════════════════════════════════════════════════════════
     1. REATIVAÇÃO POR RITMO INDIVIDUAL → SUGESTÃO
     ════════════════════════════════════════════════════════ */
  for (const cliente of clientes) {
    if (sugeridas >= MAX_SUGESTOES) break

    const vcList = (vendasPorCliente.get(cliente.id) ?? [])
      .filter(v => !v.presente) /* ignora presentes no ritmo */
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda))

    if (vcList.length < 2) continue

    /* Calcula intervalo médio entre compras */
    const intervalos: number[] = []
    for (let i = 1; i < vcList.length; i++) {
      intervalos.push(diasEntre(vcList[i - 1].data_venda, vcList[i].data_venda))
    }
    const ritmoMedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
    if (ritmoMedio < 7) continue /* comprador diário — não reativar */

    const ultimaCompra = vcList[vcList.length - 1].data_venda
    const diasSemComprar = diasEntre(ultimaCompra, hojeStr)

    /* Desvio: se passou 40% além do ritmo médio */
    const limiteAlerta = Math.round(ritmoMedio * 1.4)
    if (diasSemComprar < limiteAlerta) continue

    const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
    if (!contato) continue
    if (await jaEnviouRecente(admin, userId, cliente.id, 14)) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const msg = `Oi ${nome}! Faz um tempo que não te vemos por aqui 😊 Chegaram novidades que combinam com o seu estilo. Quer dar uma olhada?\n\n${nomeLoja}`
    const criada = await criarSugestao(
      admin, userId, cliente, contato.id,
      'reativacao',
      `Reativar ${cliente.nome ?? 'cliente'}`,
      `${cliente.nome ?? 'Cliente'} costuma comprar a cada ${ritmoMedio} dias e está há ${diasSemComprar} dias sem comprar. Sugiro enviar uma mensagem de reativação.`,
      msg,
    )
    if (criada) sugeridas++
  }

  /* ════════════════════════════════════════════════════════
     2. PADRÃO DE PRESENTES ANUAL → SUGESTÃO
     ════════════════════════════════════════════════════════ */
  const mesAtual = hoje.getMonth() + 1
  const anoAnterior = hoje.getFullYear() - 1

  for (const cliente of clientes) {
    if (sugeridas >= MAX_SUGESTOES) break

    const presentes = (vendasPorCliente.get(cliente.id) ?? []).filter(v => v.presente)
    if (presentes.length === 0) continue

    /* Verifica se esse cliente comprou presente nesse mesmo mês no ano anterior */
    const presenteAnoPassado = presentes.find(v => {
      const d = new Date(v.data_venda)
      return d.getFullYear() === anoAnterior && (d.getMonth() + 1) === mesAtual
    })
    if (!presenteAnoPassado) continue

    /* Já avisou esse ano nesse mês? */
    const jaComprou = presentes.some(v => {
      const d = new Date(v.data_venda)
      return d.getFullYear() === hoje.getFullYear() && (d.getMonth() + 1) === mesAtual
    })
    if (jaComprou) continue

    const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
    if (!contato) continue
    if (await jaEnviouRecente(admin, userId, cliente.id, 20)) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const tipo = presenteAnoPassado.tipo_presente ?? 'alguém especial'
    const tam = presenteAnoPassado.presente_tamanho
    const valor = Number(presenteAnoPassado.valor).toFixed(0)

    const msg = `Oi ${nome}! No ano passado nessa época você comprou um presente${tipo ? ` de ${tipo}` : ''}${tam ? ` (tamanho ${tam})` : ''} aqui na loja por R$${valor}. Já pensou no presente esse ano? Temos opções lindas 😊\n\n${nomeLoja}`
    const criada = await criarSugestao(
      admin, userId, cliente, contato.id,
      'brinde',
      `Presente anual — ${cliente.nome ?? 'cliente'}`,
      `${cliente.nome ?? 'Cliente'} comprou um presente${tipo ? ` de ${tipo}` : ''} nesse mesmo mês no ano passado (R$${valor}) e ainda não comprou esse ano. Sugiro lembrar do presente.`,
      msg,
    )
    if (criada) sugeridas++
  }

  /* ════════════════════════════════════════════════════════
     3. ESTOQUE ENCALHADO → OFERTA PARA CLIENTES CERTOS
     ════════════════════════════════════════════════════════ */
  type TamanhoItem = { tamanho: string; qtd: number }

  /* Calcula giro médio dos produtos vendidos */
  const girosVendidos: number[] = []
  for (const item of estoque) {
    if (!item.data_entrada) continue
    const diasNoEstoque = diasEntre(item.data_entrada, hojeStr)
    const foiVendido = vendas.some(v =>
      (v.produtos as { nome?: string }[] ?? []).some(p => p.nome?.toLowerCase().includes((item.nome as string).toLowerCase()))
    )
    if (foiVendido) girosVendidos.push(diasNoEstoque)
  }
  const giroMedio = girosVendidos.length > 0
    ? Math.round(girosVendidos.reduce((s, v) => s + v, 0) / girosVendidos.length)
    : 60

  for (const item of estoque) {
    if (sugeridas >= MAX_SUGESTOES) break
    if (!item.data_entrada) continue

    const diasNoEstoque = diasEntre(item.data_entrada, hojeStr)
    if (diasNoEstoque < giroMedio * 1.5) continue /* só alerta se passou 50% além do giro médio */

    const tams = ((item.tamanhos as TamanhoItem[]) ?? []).filter(t => t.qtd > 0)
    if (tams.length === 0) continue

    const tamanhosDisponiveis = tams.map(t => t.tamanho)

    /* Encontra clientes com esse tamanho (equivalência número↔letra) */
    const clientesAlvo = clientes.filter(c =>
      clienteServeProduto([c.tamanho_camiseta, c.tamanho_calca], tamanhosDisponiveis)
    )

    /* Pega um cliente alvo que não recebeu mensagem recente */
    for (const cliente of clientesAlvo) {
      if (sugeridas >= MAX_SUGESTOES) break
      const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
      if (!contato) continue
      if (await jaEnviouRecente(admin, userId, cliente.id, 10)) continue

      const nome = cliente.nome?.split(' ')[0] ?? 'você'
      const tamStr = tams.map(t => t.tamanho).join('/')
      const preco = item.preco_venda ? `R$${Number(item.preco_venda).toFixed(0)}` : ''

      const msg = `Oi ${nome}! Temos ${item.nome}${item.marca ? ` da ${item.marca}` : ''} no tamanho ${tamStr} que combina com você${preco ? ` por ${preco}` : ''} 🛍️ Quer saber mais?\n\n${nomeLoja}`
      const criada = await criarSugestao(
        admin, userId, cliente, contato.id,
        'oportunidade',
        `Oferta de ${item.nome} para ${cliente.nome ?? 'cliente'}`,
        `${item.nome}${item.marca ? ` (${item.marca})` : ''} está há ${diasNoEstoque} dias no estoque (giro médio: ${giroMedio} dias) e tem o tamanho de ${cliente.nome ?? 'cliente'}. Sugiro oferecer.`,
        msg,
      )
      if (criada) sugeridas++
      break /* Um cliente por produto encalhado por rodada */
    }
  }

  /* ════════════════════════════════════════════════════════
     3.5. AFINIDADE DE MARCA + TAMANHO
     Cliente gosta de Aramis e veste G → chegou Aramis G → avisa
     ════════════════════════════════════════════════════════ */
  const { data: todosInsights } = await admin
    .from('contato_insights')
    .select('cliente_id, marcas_favoritas, tamanhos')
    .eq('user_id', userId)

  type InsightSimples = { cliente_id: string; marcas_favoritas: string[] | null; tamanhos: string[] | null }
  const insightsPorCliente = new Map<string, InsightSimples>(
    ((todosInsights ?? []) as InsightSimples[]).map(i => [i.cliente_id, i])
  )

  for (const item of estoque) {
    if (sugeridas >= MAX_SUGESTOES) break
    if (!item.marca) continue

    const tams = ((item.tamanhos as TamanhoItem[]) ?? []).filter(t => t.qtd > 0)
    const tamanhosDisponiveis = tams.map(t => String(t.tamanho))

    const clientesAlvo = clientes.filter(c => {
      const ins = insightsPorCliente.get(c.id)
      if (!ins?.marcas_favoritas?.length) return false
      const gostaDaMarca = ins.marcas_favoritas.some(
        (m: string) => m.toLowerCase() === String(item.marca).toLowerCase()
      )
      if (!gostaDaMarca) return false
      if (tamanhosDisponiveis.length === 0) return true
      /* equivalência número↔letra (calça 40 = bermuda M) */
      return clienteServeProduto([c.tamanho_camiseta, c.tamanho_calca, c.tamanho_tenis], tamanhosDisponiveis)
    })

    for (const cliente of clientesAlvo) {
      if (sugeridas >= MAX_SUGESTOES) break
      const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
      if (!contato) continue
      if (await jaEnviouRecente(admin, userId, cliente.id, 14)) continue

      const nome   = cliente.nome?.split(' ')[0] ?? 'você'
      const tamStr = tams.length > 0 ? ` no tamanho ${tams.map(t => t.tamanho).join('/')}` : ''
      const preco  = item.preco_venda ? ` por R$${Number(item.preco_venda).toFixed(0)}` : ''
      const msg    = `Oi ${nome}! Chegou uma peça nova da ${item.marca} aqui na ${nomeLoja}${tamStr}${preco} — sei que você curte essa marca 🔥 Quer dar uma olhada?`

      const criada = await criarSugestao(
        admin, userId, cliente, contato.id,
        'cross_sell',
        `${item.marca} nova para ${cliente.nome ?? 'cliente'}`,
        `${cliente.nome ?? 'Cliente'} tem afinidade com a marca ${item.marca} e chegou ${item.nome} no tamanho dele(a). Sugiro avisar.`,
        msg,
      )
      if (criada) sugeridas++
      break
    }
  }

  /* ════════════════════════════════════════════════════════
     4. ATUALIZA INSIGHTS DE RITMO NO BANCO
     ════════════════════════════════════════════════════════ */
  for (const cliente of clientes) {
    const vcList = (vendasPorCliente.get(cliente.id) ?? [])
      .filter(v => !v.presente)
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda))
    if (vcList.length < 2) continue

    const intervalos: number[] = []
    for (let i = 1; i < vcList.length; i++) {
      intervalos.push(diasEntre(vcList[i - 1].data_venda, vcList[i].data_venda))
    }
    const ritmoMedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
    const ultimaCompra = vcList[vcList.length - 1].data_venda
    const diasSemComprar = diasEntre(ultimaCompra, hojeStr)

    /* Mês de pico (mês com mais compras) */
    const porMes: Record<string, number> = {}
    for (const v of vcList) {
      const m = mesStr(new Date(v.data_venda))
      porMes[m] = (porMes[m] ?? 0) + 1
    }
    const mesPico = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    try {
      await admin.from('contato_insights').upsert({
        user_id: userId,
        cliente_id: cliente.id,
        ritmo_compra_dias: ritmoMedio,
        dias_sem_comprar: diasSemComprar,
        ultima_compra: ultimaCompra,
        mes_pico: mesPico,
        qtd_compras: vcList.length,
        total_gasto: vcList.reduce((s, v) => s + Number(v.valor), 0),
        ticket_medio: vcList.reduce((s, v) => s + Number(v.valor), 0) / vcList.length,
      }, { onConflict: 'user_id,cliente_id' })
    } catch { /* ignora erro de upsert individual */ }
  }

  /* ════════════════════════════════════════════════════════
     5. ANIVERSÁRIOS NOS PRÓXIMOS 7 DIAS
     ════════════════════════════════════════════════════════ */
  const descAniv = config?.desconto_aniversario ? `${config.desconto_aniversario}% de desconto` : 'um mimo especial'

  for (const cliente of clientes) {
    if (enviadas >= MAX_ENVIOS) break
    if (!cliente.data_nascimento) continue

    const parts = String(cliente.data_nascimento).split('-').map(Number)
    const mesAniv = parts[1], diaAniv = parts[2]
    const aniv = new Date(hoje.getFullYear(), mesAniv - 1, diaAniv)
    if (aniv < hoje) aniv.setFullYear(hoje.getFullYear() + 1)
    const diasAniv = Math.round((aniv.getTime() - hoje.getTime()) / 86400000)

    if (diasAniv < 0 || diasAniv > 7) continue

    const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
    if (!contato) continue
    if (await jaEnviouRecente(admin, userId, cliente.id, 30)) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const msg  = diasAniv === 0
      ? `Oi ${nome}! Feliz aniversário! 🎂 Você tem ${descAniv} especial hoje aqui na ${nomeLoja}. Aproveite!`
      : `Oi ${nome}! Seu aniversário tá chegando em ${diasAniv} ${diasAniv === 1 ? 'dia' : 'dias'} 🎉 Passa aqui na ${nomeLoja} e garante ${descAniv} especial pra você.`

    await enviarWpp(admin, userId, cliente.id, contato.phone, msg)
    enviadas++
  }

  return NextResponse.json({ ok: true, enviadas, sugeridas, giroMedio })
}
