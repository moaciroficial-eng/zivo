import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Detalhe + resultado de uma campanha (pro histórico tipo "conversa").
   Resultado HONESTO: cruza quem recebeu × quem RESPONDEU e quem COMPROU
   depois do disparo (venda registrada no Zivo). */

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: campanha } = await admin.from('campanhas')
    .select('id, nome, objetivo, produto_marca, copy_whatsapp, status, created_at')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!campanha) return NextResponse.json({ ok: false }, { status: 404 })

  const { data: leads } = await admin.from('campanha_leads')
    .select('cliente_id, contato_id, phone, nome, status')
    .eq('campanha_id', id).eq('user_id', user.id)

  const listaLeads = (leads ?? []) as any[]
  const enviados = listaLeads.length
  const desde = campanha.created_at
  const contatoIds = listaLeads.map(l => l.contato_id).filter(Boolean)
  const clienteIds = listaLeads.map(l => l.cliente_id).filter(Boolean)

  /* Respostas: contatos da campanha que mandaram msg RECEBIDA após o disparo */
  let respostas = 0
  if (contatoIds.length) {
    const { data: msgs } = await admin.from('whatsapp_mensagens')
      .select('contato_id')
      .in('contato_id', contatoIds)
      .eq('direcao', 'recebida')
      .gte('timestamp', desde)
    respostas = new Set((msgs ?? []).map((m: any) => m.contato_id)).size
  }

  /* Conversões: clientes da campanha que COMPRARAM após o disparo */
  let conversoes = 0, receita = 0
  const clientesConvertidos = new Set<string>()
  if (clienteIds.length) {
    const { data: vendas } = await admin.from('vendas')
      .select('cliente_id, valor, created_at')
      .in('cliente_id', clienteIds)
      .gte('created_at', desde)
    for (const v of (vendas ?? []) as any[]) {
      if (!v.cliente_id) continue
      clientesConvertidos.add(v.cliente_id)
      receita += Number(v.valor) || 0
    }
    conversoes = clientesConvertidos.size
  }

  const taxaConversao = enviados ? Math.round((conversoes / enviados) * 100) : 0
  const taxaResposta = enviados ? Math.round((respostas / enviados) * 100) : 0

  return NextResponse.json({
    ok: true,
    campanha,
    metricas: { enviados, respostas, conversoes, receita, taxaConversao, taxaResposta },
    leads: listaLeads.map(l => ({
      nome: l.nome, status: l.status,
      converteu: l.cliente_id ? clientesConvertidos.has(l.cliente_id) : false,
    })),
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { status } = await req.json()

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await admin.from('campanhas').update({ status: status || 'salva' }).eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await admin.from('campanhas').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
