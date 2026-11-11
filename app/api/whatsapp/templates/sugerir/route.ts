import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ maxRetries: 1 })

/* Sugere nome, texto e botões de um template de WhatsApp a partir de um
   briefing curto do dono -- ele revisa/edita tudo na tela antes de enviar
   pra Meta (a IA nunca envia nada por conta própria). */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { brief } = await request.json().catch(() => ({ brief: '' }))
  if (!brief || !String(brief).trim()) return NextResponse.json({ ok: false, erro: 'Descreva o que o template deve dizer.' }, { status: 400 })

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'Você escreve templates de mensagem do WhatsApp Business (Meta) pra uma loja de roupas/calçados no Brasil. Regras obrigatórias da Meta: o texto NUNCA pode começar nem terminar com uma variável -- sempre precisa de palavra literal antes de {{1}} e depois da última variável. Variáveis são {{1}}, {{2}}, {{3}}... sequenciais a partir de 1, sem pular número. Tom curto, direto, de vendedor de loja do interior, nunca formal/robótico. Responda APENAS com um JSON válido, sem texto antes ou depois, no formato: {"name": "nome_em_snake_case_sem_acento", "bodyText": "texto com {{1}} etc.", "buttons": ["Botão 1", "Botão 2"]}. No máximo 3 botões, cada um com até 20 caracteres.',
      messages: [{ role: 'user', content: `Briefing do dono: ${brief}` }],
    }, { timeout: 8000 })

    const texto = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const json = texto.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return NextResponse.json({ ok: false, erro: 'A IA não respondeu num formato esperado. Tenta reformular o briefing.' })

    const sugestao = JSON.parse(json)
    return NextResponse.json({ ok: true, sugestao })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao gerar sugestão.' }, { status: 502 })
  }
}
