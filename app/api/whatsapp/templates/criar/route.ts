import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criarTemplate } from '@/lib/whatsapp-provision'
import { RODAPE_TEMPLATES } from '@/lib/whatsapp-templates-iniciais.mjs'

/* Valida as regras da Meta que mais derrubam template na análise: não pode
   começar nem terminar com variável, e as variáveis têm que ser sequenciais
   a partir de {{1}}. Roda aqui TAMBÉM (não só no cliente) -- quem chama a
   rota direto (ou um bug na tela) não passa por cima da regra. */
function validar(nome: string, texto: string): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(nome)) return 'Nome só pode ter letras minúsculas, números e _ (sem espaço, sem acento, começando com letra).'
  const corpo = String(texto || '').trim()
  if (!corpo) return 'Escreva o texto do template.'
  if (/^\{\{\d+\}\}/.test(corpo)) return 'O texto não pode começar com uma variável -- precisa de uma palavra antes.'
  if (/\{\{\d+\}\}$/.test(corpo)) return 'O texto não pode terminar com uma variável -- precisa de uma palavra depois.'
  const nums = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
  const unicos = [...new Set(nums)].sort((a, b) => a - b)
  for (let i = 0; i < unicos.length; i++) {
    if (unicos[i] !== i + 1) return `As variáveis precisam ser sequenciais a partir de {{1}} (achei: ${unicos.join(', ') || 'nenhuma'}).`
  }
  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { name, category, bodyText, examples, buttons, footer } = await request.json().catch(() => ({}))

  const erroValidacao = validar(name ?? '', bodyText ?? '')
  if (erroValidacao) return NextResponse.json({ ok: false, erro: erroValidacao }, { status: 400 })

  const qtdVars = new Set([...String(bodyText).matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size
  const exemplos: string[] = Array.isArray(examples) ? examples.slice(0, qtdVars) : []
  if (exemplos.length < qtdVars || exemplos.some(e => !String(e || '').trim())) {
    return NextResponse.json({ ok: false, erro: `Preencha um exemplo pra cada uma das ${qtdVars} variável(is).` }, { status: 400 })
  }

  const botoesLimpos: { type: 'QUICK_REPLY'; text: string }[] = (Array.isArray(buttons) ? buttons : [])
    .map((b: string) => String(b || '').trim()).filter(Boolean).slice(0, 3)
    .map((text: string) => ({ type: 'QUICK_REPLY' as const, text: text.slice(0, 25) }))

  const components: unknown[] = [
    { type: 'BODY', text: bodyText, example: { body_text: [exemplos] } },
    { type: 'FOOTER', text: (footer && String(footer).trim()) || RODAPE_TEMPLATES },
  ]
  if (botoesLimpos.length) components.push({ type: 'BUTTONS', buttons: botoesLimpos })

  const wabaId = process.env.META_WABA_ID
  const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
  if (!wabaId || !token) {
    return NextResponse.json({ ok: false, erro: 'META_WABA_ID / META_ACCESS_TOKEN não configurados no servidor.' })
  }

  const resultado = await criarTemplate(wabaId, token, {
    name, language: 'pt_BR', category: category === 'UTILITY' ? 'UTILITY' : 'MARKETING', components,
  })
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.motivo || 'Falha ao criar o template.' }, { status: 502 })
  return NextResponse.json({ ok: true, id: resultado.id })
}
