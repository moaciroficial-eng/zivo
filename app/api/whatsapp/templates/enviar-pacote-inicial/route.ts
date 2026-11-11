import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criarTemplate, consultarStatusTemplates } from '@/lib/whatsapp-provision'
import { TEMPLATES_INICIAIS } from '@/lib/whatsapp-templates-iniciais.mjs'

/* Envia o pacote inicial de 7 templates (mesmo JSON do script de terminal)
   pra aprovação da Meta, na WABA-fonte (Terny). Pula os que já existem —
   clicar de novo não duplica nem reenvia. Só dono logado — nunca expõe
   nem loga o token. */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const wabaId = process.env.META_WABA_ID
  const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (!wabaId || !token) {
    return NextResponse.json({ ok: false, erro: 'META_WABA_ID / META_ACCESS_TOKEN não configurados no servidor.' })
  }

  try {
    const existentes = await consultarStatusTemplates(wabaId, token).catch(() => [])
    const nomesExistentes = new Set(existentes.map(t => t.name))

    const resultados: { name: string; ok: boolean; motivo?: string; jaExistia?: boolean }[] = []
    for (const t of TEMPLATES_INICIAIS) {
      if (nomesExistentes.has(t.name)) { resultados.push({ name: t.name, ok: true, jaExistia: true }); continue }
      const r = await criarTemplate(wabaId, token, t)
      resultados.push({ name: t.name, ok: r.ok, motivo: r.motivo })
    }
    return NextResponse.json({ ok: true, resultados })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar templates.' }, { status: 502 })
  }
}
