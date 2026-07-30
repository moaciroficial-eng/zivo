import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { clonarTemplates } from '@/lib/whatsapp-provision'

/* Clona os templates já aprovados da WABA-fonte (env) pra WABA desta loja.
   Funciona sem Embedded Signup — basta a loja já ter WABA + token salvos
   (conexão manual). É o caminho "sem burocracia" pro lojista não recriar
   template nenhum na mão. */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await admin.from('loja_config')
    .select('meta_waba_id, meta_access_token')
    .eq('user_id', user.id).maybeSingle()

  const targetWabaId = cfg?.meta_waba_id
  const targetToken = cfg?.meta_access_token
  if (!targetWabaId || !targetToken) {
    return NextResponse.json({ ok: false, erro: 'Conecte o WhatsApp da loja primeiro (WABA ID + token).' })
  }

  const sourceWabaId = process.env.META_WABA_ID
  const sourceToken = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (!sourceWabaId || !sourceToken) {
    return NextResponse.json({ ok: false, erro: 'WABA-fonte não configurada no servidor (META_WABA_ID / META_ACCESS_TOKEN).' })
  }

  try {
    const templates = await clonarTemplates({ sourceWabaId, sourceToken, targetWabaId, targetToken })
    const criados = templates.filter(t => t.ok && !t.jaExistia).length
    const existentes = templates.filter(t => t.jaExistia).length
    const falhas = templates.filter(t => !t.ok).length
    return NextResponse.json({ ok: true, resumo: { criados, existentes, falhas }, templates })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao provisionar templates.' }, { status: 502 })
  }
}
