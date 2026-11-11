import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apagarTemplate, criarTemplate } from '@/lib/whatsapp-provision'
import { TEMPLATES_INICIAIS } from '@/lib/whatsapp-templates-iniciais.mjs'

/* Corrige e reenvia UM template (ex.: depois de ajustar o texto de um que
   foi rejeitado). Apaga a versão antiga pelo nome e cria de novo com a
   definição atual de lib/whatsapp-templates-iniciais.mjs — a Meta não deixa
   criar com o mesmo nome enquanto a versão rejeitada ainda existe. Só dono
   logado; nunca expõe nem loga o token. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { name } = await request.json().catch(() => ({ name: null }))
  const def = TEMPLATES_INICIAIS.find((t: { name: string }) => t.name === name)
  if (!def) return NextResponse.json({ ok: false, erro: `Template "${name}" não encontrado na definição atual.` }, { status: 400 })

  const wabaId = process.env.META_WABA_ID
  const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (!wabaId || !token) {
    return NextResponse.json({ ok: false, erro: 'META_WABA_ID / META_ACCESS_TOKEN não configurados no servidor.' })
  }

  const del = await apagarTemplate(wabaId, token, def.name)
  if (!del.ok) return NextResponse.json({ ok: false, erro: `Falha ao apagar a versão antiga: ${del.motivo}` }, { status: 502 })

  const criado = await criarTemplate(wabaId, token, def)
  return NextResponse.json({ ok: true, resultado: { name: def.name, ok: criado.ok, motivo: criado.motivo } })
}
