import { sendWhatsAppMessage, sendWhatsAppTemplate, sendWhatsAppImage, type WhatsAppCreds } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   BRAÇO DE EXECUÇÃO — enviar oferta respeitando a janela de 24h

   Regra da Meta: a loja só manda TEXTO LIVRE se o cliente escreveu
   nas últimas 24h. Fora disso, só TEMPLATE aprovado. Este helper
   decide sozinho:
     • janela aberta  → manda o texto livre (a copy inteira)
     • janela fechada → manda o template aprovado (com variáveis)
   e grava no histórico do chat pra aparecer no Zivo.

   Assim nenhuma oferta "some" — ou entrega por texto, ou por template.
   ══════════════════════════════════════════════════════════════ */

export type EnvioOferta = {
  userId: string
  contatoId?: string | null   // pra checar a janela e gravar histórico
  phone: string
  texto: string               // copy completa (janela aberta / o que mostrar no chat)
  templateName: string        // template de texto pra janela fechada (fallback)
  templateVars: string[]      // variáveis do template ({{1}}, {{2}}...) na ordem
  fotoUrl?: string | null     // foto do produto
  templateFotoName?: string   // template com HEADER de imagem (frio recebe a foto na hora)
  creds?: WhatsAppCreds
}

export type ResultadoEnvio = {
  ok: boolean
  via: 'texto' | 'template' | null
  fotoInclusa: boolean        // true se a foto já foi entregue nesta mensagem
  messageId?: string
  erro?: string
}

/* Janela aberta = existe mensagem RECEBIDA desse contato nas últimas 24h */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function janelaAberta(admin: any, contatoId: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('whatsapp_mensagens')
    .select('id')
    .eq('contato_id', contatoId)
    .eq('direcao', 'recebida')
    .gte('timestamp', desde)
    .limit(1)
    .maybeSingle()
  return !!data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enviarOferta(admin: any, opts: EnvioOferta): Promise<ResultadoEnvio> {
  const aberta = opts.contatoId ? await janelaAberta(admin, opts.contatoId) : false

  let messageId: string | undefined
  let via: 'texto' | 'template'
  let fotoInclusa = false
  try {
    if (aberta) {
      via = 'texto'
      /* Janela aberta: com foto → imagem com a copy de legenda; sem foto → texto. */
      if (opts.fotoUrl) {
        messageId = (await sendWhatsAppImage({ phone: opts.phone, imageUrl: opts.fotoUrl, caption: opts.texto, creds: opts.creds })).messageId
        fotoInclusa = true
      } else {
        messageId = (await sendWhatsAppMessage({ phone: opts.phone, message: opts.texto, creds: opts.creds })).messageId
      }
    } else {
      via = 'template'
      /* Janela fechada: se há foto E um template com header de imagem, o
         cliente recebe a foto NA HORA. Se esse template falhar (ex: ainda
         não aprovado), cai no template de texto e a foto fica pendente. */
      if (opts.fotoUrl && opts.templateFotoName) {
        try {
          messageId = (await sendWhatsAppTemplate({
            phone: opts.phone, templateName: opts.templateFotoName,
            variaveis: opts.templateVars, imagemHeader: opts.fotoUrl, creds: opts.creds,
          })).messageId
          fotoInclusa = true
        } catch {
          messageId = (await sendWhatsAppTemplate({
            phone: opts.phone, templateName: opts.templateName,
            variaveis: opts.templateVars, creds: opts.creds,
          })).messageId
        }
      } else {
        messageId = (await sendWhatsAppTemplate({
          phone: opts.phone, templateName: opts.templateName,
          variaveis: opts.templateVars, creds: opts.creds,
        })).messageId
      }
    }
  } catch (e) {
    return { ok: false, via: null, fotoInclusa: false, erro: e instanceof Error ? e.message : String(e) }
  }

  /* Grava no histórico do chat (mostra a copy renderizada, mesmo quando
     foi por template — o dono vê o que o cliente recebeu). */
  if (opts.contatoId) {
    const timestamp = new Date().toISOString()
    try {
      await admin.from('whatsapp_mensagens').insert({
        user_id: opts.userId, contato_id: opts.contatoId, message_id: messageId ?? null,
        direcao: 'enviada', tipo: 'texto', conteudo: opts.texto,
        status: 'enviada', timestamp, raw: { origem: 'ia', via },
      })
      await admin.from('whatsapp_contatos').update({
        ultima_mensagem: opts.texto, ultima_mensagem_at: timestamp,
      }).eq('id', opts.contatoId)
    } catch { /* histórico é secundário — não derruba o envio */ }
  }

  return { ok: true, via, fotoInclusa, messageId }
}
