import { SupabaseClient } from '@supabase/supabase-js'

type EntradaConhecimento = {
  categoria: string
  titulo: string
  conteudo: string
}

/* Carrega todo o conhecimento ativo e monta bloco de contexto para os agentes */
export async function carregarConhecimento(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await admin
    .from('conhecimento')
    .select('categoria, titulo, conteudo')
    .eq('user_id', userId)
    .eq('ativo', true)
    .order('categoria')
    .order('created_at')

  if (!data?.length) return ''

  const porCategoria = new Map<string, EntradaConhecimento[]>()
  for (const item of data as EntradaConhecimento[]) {
    const cat = item.categoria ?? 'geral'
    if (!porCategoria.has(cat)) porCategoria.set(cat, [])
    porCategoria.get(cat)!.push(item)
  }

  const labels: Record<string, string> = {
    clientes:  '👥 Sobre os clientes',
    produtos:  '👕 Sobre os produtos',
    vendas:    '💰 Sobre vendas e atendimento',
    mercado:   '📍 Sobre o mercado local',
    regras:    '📋 Regras do negócio',
    geral:     '📌 Conhecimento geral',
  }

  const partes: string[] = ['🧠 CONHECIMENTO DA LOJA (absorva e aplique):']

  for (const [cat, itens] of porCategoria) {
    partes.push(`\n${labels[cat] ?? cat}:`)
    for (const item of itens) {
      partes.push(`• ${item.titulo}: ${item.conteudo}`)
    }
  }

  return partes.join('\n')
}

/* Salva um novo aprendizado (chamado pelo owner/comando quando diz "aprende:") */
export async function salvarAprendizado(
  admin: SupabaseClient,
  userId: string,
  texto: string,
  categoria = 'geral'
): Promise<string> {
  /* Usa IA pra extrair título e conteúdo do texto livre */
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Converta esse aprendizado sobre uma loja de roupas em JSON:
"${texto}"

Retorne:
{
  "titulo": "título curto (máx 8 palavras)",
  "conteudo": "o conhecimento em 1-2 frases claras e objetivas",
  "categoria": "clientes | produtos | vendas | mercado | regras | geral"
}`,
    }],
  })

  const raw = (res.content[0] as { text: string }).text.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  const parsed = match ? JSON.parse(match[0]) : { titulo: 'Aprendizado', conteudo: texto, categoria }

  await admin.from('conhecimento').insert({
    user_id:   userId,
    categoria: parsed.categoria ?? categoria,
    titulo:    parsed.titulo,
    conteudo:  parsed.conteudo,
    fonte:     'whatsapp',
  })

  return `✅ Aprendi!\n\n*${parsed.titulo}*\n${parsed.conteudo}\n\nCategoria: ${parsed.categoria}`
}
