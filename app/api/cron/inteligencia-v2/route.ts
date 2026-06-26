import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

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
  await sendWhatsAppMessage({ phone, message: mensagem })
  const { data: contato } = await admin
    .from('whatsapp_contatos').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle()
  if (contato?.id) {
    const ts = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contato.id,
      direcao: 'enviada', tipo: 'texto', conteudo: mensagem, status: 'enviada', timestamp: ts,
    })
    await admin.from('whatsapp_contatos').update({ ultima_mensagem: mensagem, ultima_mensagem_at: ts }).eq('id', contato.id)
  }
  /* Registra ação pra evitar duplo disparo */
  await admin.from('inteligencia_acoes').insert({ user_id: userId, cliente_id: clienteId, mensagem, enviada_em: new Date().toISOString() }).catch(() => null)
}

async function buscarPhone(admin: ReturnType<typeof createAdmin>, userId: string, clienteId: string, telefone?: string | null) {
  const { data: wa } = await admin.from('whatsapp_contatos').select('phone').eq('user_id', userId).eq('cliente_id', clienteId).maybeSingle()
  if (wa?.phone) return wa.phone as string
  if (telefone) {
    const last = telefone.replace(/\D/g, '').slice(-8)
    const { data: wa2 } = await admin.from('whatsapp_contatos').select('phone').eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
    if (wa2?.phone) return wa2.phone as string
  }
  return null
}

/* Verifica se já enviou mensagem pra esse cliente nos últimos N dias */
async function jaEnviouRecente(admin: ReturnType<typeof createAdmin>, userId: string, clienteId: string, diasMinimos: number) {
  const desde = new Date()
  desde.setDate(desde.getDate() - diasMinimos)
  const { data } = await admin.from('inteligencia_acoes')
    .select('id').eq('user_id', userId).eq('cliente_id', clienteId)
    .gte('enviada_em', desde.toISOString()).limit(1)
  return (data?.length ?? 0) > 0
}

export async function GET() {
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

  let enviadas = 0
  const MAX_ENVIOS = 5 /* Limite por rodada pra não spammar */

  /* ════════════════════════════════════════════════════════
     1. REATIVAÇÃO POR RITMO INDIVIDUAL
     ════════════════════════════════════════════════════════ */
  for (const cliente of clientes) {
    if (enviadas >= MAX_ENVIOS) break

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

    const phone = await buscarPhone(admin, userId, cliente.id, cliente.telefone)
    if (!phone) continue
    if (await jaEnviouRecente(admin, userId, cliente.id, 14)) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const msg = `Oi ${nome}! Faz um tempo que não te vemos por aqui 😊 Chegaram novidades que combinam com o seu estilo. Quer dar uma olhada?\n\n${nomeLoja}`
    await enviarWpp(admin, userId, cliente.id, phone, msg)
    enviadas++
  }

  /* ════════════════════════════════════════════════════════
     2. PADRÃO DE PRESENTES ANUAL
     ════════════════════════════════════════════════════════ */
  const mesAtual = hoje.getMonth() + 1
  const anoAnterior = hoje.getFullYear() - 1

  for (const cliente of clientes) {
    if (enviadas >= MAX_ENVIOS) break

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

    const phone = await buscarPhone(admin, userId, cliente.id, cliente.telefone)
    if (!phone) continue
    if (await jaEnviouRecente(admin, userId, cliente.id, 20)) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const tipo = presenteAnoPassado.tipo_presente ?? 'alguém especial'
    const tam = presenteAnoPassado.presente_tamanho
    const valor = Number(presenteAnoPassado.valor).toFixed(0)

    const msg = `Oi ${nome}! No ano passado nessa época você comprou um presente${tipo ? ` de ${tipo}` : ''}${tam ? ` (tamanho ${tam})` : ''} aqui na loja por R$${valor}. Já pensou no presente esse ano? Temos opções lindas 😊\n\n${nomeLoja}`
    await enviarWpp(admin, userId, cliente.id, phone, msg)
    enviadas++
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
    if (enviadas >= MAX_ENVIOS) break
    if (!item.data_entrada) continue

    const diasNoEstoque = diasEntre(item.data_entrada, hojeStr)
    if (diasNoEstoque < giroMedio * 1.5) continue /* só alerta se passou 50% além do giro médio */

    const tams = ((item.tamanhos as TamanhoItem[]) ?? []).filter(t => t.qtd > 0)
    if (tams.length === 0) continue

    const tamanhosDisponiveis = tams.map(t => t.tamanho.toLowerCase())

    /* Encontra clientes com esse tamanho */
    const clientesAlvo = clientes.filter(c => {
      const tc = c.tamanho_camiseta?.toLowerCase()
      const tca = c.tamanho_calca?.toLowerCase()
      return tamanhosDisponiveis.some(t => t === tc || t === tca)
    })

    /* Pega um cliente alvo que não recebeu mensagem recente */
    for (const cliente of clientesAlvo) {
      if (enviadas >= MAX_ENVIOS) break
      const phone = await buscarPhone(admin, userId, cliente.id, cliente.telefone)
      if (!phone) continue
      if (await jaEnviouRecente(admin, userId, cliente.id, 10)) continue

      const nome = cliente.nome?.split(' ')[0] ?? 'você'
      const tamStr = tams.map(t => t.tamanho).join('/')
      const preco = item.preco_venda ? `R$${Number(item.preco_venda).toFixed(0)}` : ''

      const msg = `Oi ${nome}! Temos ${item.nome}${item.marca ? ` da ${item.marca}` : ''} no tamanho ${tamStr} que combina com você${preco ? ` por ${preco}` : ''} 🛍️ Quer saber mais?\n\n${nomeLoja}`
      await enviarWpp(admin, userId, cliente.id, phone, msg)
      enviadas++
      break /* Um cliente por produto encalhado por rodada */
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
    }, { onConflict: 'user_id,cliente_id' }).catch(() => null)
  }

  return NextResponse.json({ ok: true, enviadas, giroMedio })
}
