import { sendWhatsAppMessage } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   RESUMO DIÁRIO NO WHATSAPP DO DONO

   Depois da análise diária, as melhores sugestões vão direto pro
   WhatsApp do dono, numeradas. Ele aprova respondendo o número
   ("1", "enviar 2") — o owner/comando reconhece e dispara a
   mensagem pro cliente. Esforço zero: o dono não precisa abrir
   o app pra IA trabalhar.
   ══════════════════════════════════════════════════════════════ */

type SugestaoRow = {
  id: string
  tipo: string
  titulo: string
  descricao: string
  prioridade: number
  acao: {
    tipo?: string
    clientes?: string[]
    sugestao_mensagem?: string
    contato_id?: string
    cliente_id?: string
    digest_num?: number
    digest_data?: string
  } | null
}

const MAX_ITENS_DIGEST = 5

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enviarResumoDiario(admin: any, userId: string): Promise<{ enviado: boolean; itens: number }> {
  const { data: config } = await admin
    .from('loja_config')
    .select('owner_phone, nome_loja')
    .eq('user_id', userId)
    .maybeSingle()

  const ownerPhone = (config?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
  if (!ownerPhone) return { enviado: false, itens: 0 }

  /* Sugestões pendentes: as acionáveis (mensagem individual pronta) primeiro */
  const { data: sugestoes } = await admin
    .from('agente_sugestoes')
    .select('id, tipo, titulo, descricao, prioridade, acao')
    .eq('user_id', userId)
    .eq('status', 'pendente')
    .order('prioridade', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(30)

  const todas = (sugestoes ?? []) as SugestaoRow[]
  const acionaveis = todas.filter(s =>
    s.acao?.tipo === 'enviar_mensagem' && s.acao.contato_id && s.acao.sugestao_mensagem
  ).slice(0, MAX_ITENS_DIGEST)

  const informativas = todas
    .filter(s => !acionaveis.includes(s))
    .slice(0, 2)

  if (acionaveis.length === 0 && informativas.length === 0) return { enviado: false, itens: 0 }

  const hojeStr = new Date().toISOString().split('T')[0]

  /* Numera e marca cada sugestão acionável pro owner/comando achar depois */
  const linhas: string[] = []
  for (let i = 0; i < acionaveis.length; i++) {
    const s = acionaveis[i]
    const num = i + 1
    await admin.from('agente_sugestoes')
      .update({ acao: { ...s.acao, digest_num: num, digest_data: hojeStr } })
      .eq('id', s.id)
    const alvo = s.acao?.clientes?.[0] ?? 'cliente'
    linhas.push(`*${num}️⃣ ${s.titulo}*\n${s.descricao.split('\n')[0]}\n_→ mensagem pronta pra ${alvo}_`)
  }

  const extras = informativas.map(s => `💡 ${s.titulo}`).join('\n')

  const corpo = [
    `☀️ *Bom dia! Oportunidades de hoje na ${config?.nome_loja ?? 'loja'}:*`,
    '',
    linhas.join('\n\n'),
    extras ? `\n${extras}` : '',
    '',
    acionaveis.length > 0
      ? `Responde o *número* que eu envio a mensagem pro cliente.\nPra mudar o texto: *"1: sua mensagem"*. Pra ver antes: *"detalhes 1"*.`
      : 'Abre a aba Ações no app pra ver mais.',
  ].filter(Boolean).join('\n')

  const { messageId } = await sendWhatsAppMessage({ phone: ownerPhone, message: corpo })

  /* Salva no histórico da conversa com o dono */
  const phone = ownerPhone.startsWith('55') ? ownerPhone : `55${ownerPhone}`
  const { data: contatoDono } = await admin
    .from('whatsapp_contatos').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle()
  if (contatoDono?.id) {
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contatoDono.id, message_id: messageId ?? null,
      direcao: 'enviada', tipo: 'texto', conteudo: corpo, status: 'enviada', timestamp,
      raw: { origem: 'ia' },
    })
  }

  return { enviado: true, itens: acionaveis.length }
}

/* ── Aprovação por resposta: acha a sugestão N do digest de hoje ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarSugestaoDigest(admin: any, userId: string, num: number): Promise<SugestaoRow | null> {
  const hojeStr = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('agente_sugestoes')
    .select('id, tipo, titulo, descricao, prioridade, acao')
    .eq('user_id', userId)
    .eq('status', 'pendente')
    .eq('acao->>digest_num', String(num))
    .eq('acao->>digest_data', hojeStr)
    .limit(1)
  return ((data ?? [])[0] as SugestaoRow) ?? null
}

/* Envia a mensagem da sugestão aprovada pro cliente e resolve tudo.
   textoCustom: o dono pode editar o texto respondendo "1: nova mensagem" */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aprovarSugestaoDigest(admin: any, userId: string, sugestao: SugestaoRow, textoCustom?: string): Promise<string> {
  const acao = sugestao.acao
  if (!acao?.contato_id || !acao.sugestao_mensagem) {
    return 'Essa sugestão não tem mensagem pronta — abre a aba Ações no app pra resolver por lá.'
  }
  const mensagem = (textoCustom?.trim() || acao.sugestao_mensagem).trim()

  const { data: contato } = await admin
    .from('whatsapp_contatos').select('id, nome, phone')
    .eq('id', acao.contato_id).maybeSingle()
  if (!contato?.phone) return 'Não achei o telefone desse cliente. 😕'

  const { messageId } = await sendWhatsAppMessage({ phone: contato.phone, message: mensagem })

  const timestamp = new Date().toISOString()
  await admin.from('whatsapp_mensagens').insert({
    user_id: userId, contato_id: contato.id, message_id: messageId ?? null,
    direcao: 'enviada', tipo: 'texto', conteudo: mensagem, status: 'enviada', timestamp,
    raw: { origem: 'ia' },
  })
  await admin.from('whatsapp_contatos').update({
    ultima_mensagem: mensagem, ultima_mensagem_at: timestamp,
  }).eq('id', contato.id)

  /* Registra cadência (não abordar de novo em poucos dias) e resolve a sugestão */
  if (acao.cliente_id) {
    try {
      await admin.from('inteligencia_acoes').insert({
        user_id: userId, cliente_id: acao.cliente_id,
        mensagem, enviada_em: timestamp,
      })
    } catch { /* ignora */ }
  }
  await admin.from('agente_sugestoes').update({ status: 'resolvida' }).eq('id', sugestao.id)

  const nome = contato.nome ?? 'o cliente'
  return `✅ Enviado pra *${nome}*${textoCustom ? ' (com seu texto)' : ''}:\n\n_"${mensagem}"_`
}
