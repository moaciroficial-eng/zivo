import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { capitalizarPrimeiroNome } from '@/lib/whatsapp'
import { statusAprovadoTemplates } from '@/lib/whatsapp-provision'
import type { PessoaPublico } from '@/lib/campanhas/disparo-template'

/* Cria um disparo em massa: salva o cabeçalho + um registro 'pendente' por
   pessoa (congela nome/telefone/variáveis AGORA -- se o cliente mudar o
   cadastro depois, não afeta um disparo já criado). Se vier `agendadoPara`,
   fica 'agendado' pro cron processar na hora certa; senão, 'rascunho' até o
   dono chamar o envio em lote pela tela ("agora"). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { templateName, extras, bodyText, pessoas, agendadoPara, filtro } = await request.json().catch(() => ({})) as {
    templateName?: string; extras?: string[]; bodyText?: string
    pessoas?: PessoaPublico[]; agendadoPara?: string | null; filtro?: unknown
  }
  if (!templateName) return NextResponse.json({ ok: false, erro: 'Faltou o template.' }, { status: 400 })
  if (!Array.isArray(pessoas) || pessoas.length === 0) return NextResponse.json({ ok: false, erro: 'Faltou o público.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const wabaId = process.env.META_WABA_ID
  const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (wabaId && token) {
    const status = await statusAprovadoTemplates(wabaId, token).catch(() => new Map<string, string>())
    if (status.get(templateName) !== 'APPROVED') {
      return NextResponse.json({ ok: false, erro: 'Esse template ainda não está aprovado pela Meta.' }, { status: 400 })
    }
  }

  let agendadoISO: string | null = null
  if (agendadoPara) {
    const d = new Date(agendadoPara)
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) agendadoISO = d.toISOString()
  }

  const { data: disparo, error } = await admin.from('disparo_templates').insert({
    user_id: user.id,
    template_name: templateName,
    variaveis_extra: { extras: extras ?? [], bodyText: bodyText ?? null },
    filtro: filtro ?? null,
    total_destinatarios: pessoas.length,
    status: agendadoISO ? 'agendado' : 'enviando',
    agendado_para: agendadoISO,
  }).select('id').single()

  if (error || !disparo) {
    return NextResponse.json({ ok: false, erro: error?.message ?? 'Falha ao criar o disparo.' }, { status: 500 })
  }

  const rows = pessoas.map(p => ({
    disparo_id: disparo.id,
    user_id: user.id,
    cliente_id: p.clienteId || null,
    contato_id: p.contatoId || null,
    phone: p.phone,
    nome: p.nome,
    variaveis: [capitalizarPrimeiroNome(p.nome, 'você'), ...(extras ?? [])],
    status: 'pendente',
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const { error: errLote } = await admin.from('disparo_template_envios').insert(rows.slice(i, i + 500))
    if (errLote) return NextResponse.json({ ok: false, erro: `Falha ao gravar destinatários: ${errLote.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, disparoId: disparo.id, total: pessoas.length, agendado: !!agendadoISO })
}

/* Histórico dos disparos já criados (pra abrir o resultado de cada um). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from('disparo_templates')
    .select('id, template_name, status, total_destinatarios, agendado_para, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)

  return NextResponse.json({ ok: true, disparos: data ?? [] })
}
