import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarStatusTemplates } from '@/lib/whatsapp-provision'

/* Lista os templates da WABA-fonte (Terny) com status atual na Meta.
   Só dono logado — nunca expõe o token. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const wabaId = process.env.META_WABA_ID
  const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (!wabaId || !token) {
    return NextResponse.json({ ok: false, erro: 'META_WABA_ID / META_ACCESS_TOKEN não configurados no servidor.' })
  }

  try {
    const templates = await consultarStatusTemplates(wabaId, token)
    return NextResponse.json({ ok: true, templates })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao consultar templates.' }, { status: 502 })
  }
}
