import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorToken, registrarNumero, assinarWebhook, clonarTemplates } from '@/lib/whatsapp-provision'

/* Finaliza o Embedded Signup: recebe o `code` + WABA/phone que o popup
   da Meta devolveu, e deixa a loja pronta pra usar o WhatsApp:
   1) troca o code por um token de acesso
   2) registra o número na Cloud API
   3) assina o Zivo nos webhooks da WABA
   4) clona os templates já aprovados da WABA-fonte
   5) salva as credenciais na loja_config */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { code, wabaId, phoneNumberId } = await request.json() as {
    code?: string; wabaId?: string; phoneNumberId?: string
  }
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ ok: false, erro: 'Dados incompletos do Embedded Signup (code/waba/phone).' }, { status: 400 })
  }

  const steps: Record<string, { ok: boolean; motivo?: string }> = {}

  let token: string
  try {
    token = await trocarCodePorToken(code)
    steps.token = { ok: true }
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao trocar o code por token.' }, { status: 502 })
  }

  // Registrar número e assinar webhook — best-effort (não travam a conexão)
  steps.registro = await registrarNumero(phoneNumberId, token).catch(e => ({ ok: false, motivo: String(e) }))
  steps.webhook = await assinarWebhook(wabaId, token).catch(e => ({ ok: false, motivo: String(e) }))

  // Provisionar templates a partir da WABA-fonte (env)
  let templates: { name: string; ok: boolean; motivo?: string; jaExistia?: boolean }[] = []
  const sourceWabaId = process.env.META_WABA_ID
  const sourceToken = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (sourceWabaId && sourceToken) {
    try {
      templates = await clonarTemplates({ sourceWabaId, sourceToken, targetWabaId: wabaId, targetToken: token })
      steps.templates = { ok: true }
    } catch (e) {
      steps.templates = { ok: false, motivo: e instanceof Error ? e.message : 'falha ao clonar templates' }
    }
  } else {
    steps.templates = { ok: false, motivo: 'WABA-fonte não configurada no servidor (META_WABA_ID / META_ACCESS_TOKEN)' }
  }

  // Salvar credenciais na loja
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await admin.from('loja_config').upsert({
    user_id: user.id,
    whatsapp_provider: 'meta',
    meta_phone_number_id: phoneNumberId,
    meta_waba_id: wabaId,
    meta_access_token: token,
  }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ ok: false, erro: 'Conectou na Meta mas falhou ao salvar: ' + error.message, steps, templates }, { status: 500 })

  return NextResponse.json({ ok: true, steps, templates })
}
