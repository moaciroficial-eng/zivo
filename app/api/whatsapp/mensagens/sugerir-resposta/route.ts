import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const anthropic = new Anthropic({ maxRetries: 1 })

/* Sugere uma resposta pro DONO revisar e editar no campo de digitar --
   nunca envia nada por conta própria (item 5). Sonnet, não Haiku: aqui o
   texto é lido pelo cliente de verdade, então a qualidade da escrita importa
   mais que velocidade/custo -- mesma régua usada em campanhas/consultora,
   gerar-plano, chat, etc. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const { contatoId } = await request.json().catch(() => ({})) as { contatoId?: string }
  if (!contatoId) return NextResponse.json({ ok: false, erro: 'contatoId é obrigatório.' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: contato }, { data: config }, { data: mensagens }] = await Promise.all([
    admin.from('whatsapp_contatos').select('nome, phone, cliente_id').eq('id', contatoId).eq('user_id', user.id).maybeSingle(),
    admin.from('loja_config').select('nome_loja').eq('user_id', user.id).maybeSingle(),
    admin.from('whatsapp_mensagens').select('direcao, tipo, conteudo, timestamp').eq('contato_id', contatoId)
      .order('timestamp', { ascending: false }).limit(15),
  ])
  if (!contato) return NextResponse.json({ ok: false, erro: 'Contato não encontrado.' }, { status: 404 })

  const historico = [...(mensagens ?? [])].reverse()
    .map(m => `[${m.direcao === 'enviada' ? 'LOJA' : 'CLIENTE'}] ${m.conteudo ?? (m.tipo === 'imagem' ? '📷 Foto' : m.tipo === 'audio' ? '🎵 Áudio' : m.tipo)}`)
    .join('\n')
  if (!historico) return NextResponse.json({ ok: false, erro: 'Ainda não há mensagens nessa conversa pra sugerir resposta.' })

  const nomeLoja = config?.nome_loja ?? 'a loja'
  const nomeCliente = (contato.nome ?? '').split(/\s+/)[0] || 'cliente'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system: `Você ajuda o DONO de ${nomeLoja} (loja de roupas no WhatsApp) a escrever a próxima resposta pro cliente ${nomeCliente}. O dono vai REVISAR e EDITAR antes de enviar -- então escreva como o dono mesmo escreveria: direto, natural, brasileiro, no máximo 1 emoji, sem exagero ("que máximo!", "amei!"). NUNCA invente preço, prazo, disponibilidade ou qualquer fato que não esteja no histórico. Responda APENAS com o texto da mensagem sugerida, sem aspas, sem explicação, sem markdown.`,
      messages: [{ role: 'user', content: `HISTÓRICO DA CONVERSA (mais recente embaixo):\n${historico}\n\nEscreva a próxima resposta da loja.` }],
    }, { timeout: 10000 })

    const texto = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    if (!texto) return NextResponse.json({ ok: false, erro: 'A IA não conseguiu sugerir uma resposta agora.' })
    return NextResponse.json({ ok: true, sugestao: texto })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao gerar sugestão.' }, { status: 502 })
  }
}
