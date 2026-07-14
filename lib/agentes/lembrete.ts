import { sendWhatsAppMessage, donoAssumiuConversa } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   LEMBRETE PARA QUEM NÃO RESPONDEU

   Numa campanha de cadastro, "não respondeu" = recebeu a abertura
   mas nunca mandou nenhuma mensagem de volta (histórico só tem a
   fala do agente, zero [contato]). Manda um lembrete gentil e
   MANTÉM a conversa viva — quando a pessoa responder, o executor
   continua o cadastro normalmente.
   ══════════════════════════════════════════════════════════════ */

type HistItem = { papel: string; texto: string }
type EstadoRow = {
  id: string; contato_id: string; historico: HistItem[]; dados_coletados: Record<string, unknown>
  whatsapp_contatos: { nome: string | null; phone: string } | null
}

/* Considera campanhas de cadastro dos últimos 14 dias */
const JANELA_DIAS = 14

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function naoResponderam(admin: any, userId: string): Promise<EstadoRow[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()

  const { data: tarefas } = await admin
    .from('agente_tarefas')
    .select('id')
    .eq('user_id', userId)
    .eq('tipo', 'atualizar_cadastro')
    .gte('created_at', desde)
    .limit(20)
  const tarefaIds = (tarefas ?? []).map((t: { id: string }) => t.id)
  if (tarefaIds.length === 0) return []

  const { data: estados } = await admin
    .from('agente_conversa_estado')
    .select('id, contato_id, historico, dados_coletados, whatsapp_contatos(nome, phone)')
    .eq('user_id', userId)
    .in('tarefa_id', tarefaIds)
    .eq('status', 'aguardando')
    .limit(500)

  /* nunca respondeu = histórico sem nenhuma fala do contato */
  return ((estados ?? []) as EstadoRow[]).filter(e => {
    const h = Array.isArray(e.historico) ? e.historico : []
    return h.length > 0 && !h.some(x => x.papel === 'contato')
  })
}

/* Preview: quantos e quem (pra confirmação do dono) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function previewLembrete(admin: any, userId: string): Promise<{ total: number; nomes: string[] }> {
  const pend = await naoResponderam(admin, userId)
  return {
    total: pend.length,
    nomes: pend.slice(0, 12).map(e => e.whatsapp_contatos?.nome ?? 'cliente'),
  }
}

/* Executa: manda o lembrete e mantém a conversa viva */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enviarLembretes(admin: any, userId: string): Promise<number> {
  const pend = await naoResponderam(admin, userId)
  let enviados = 0

  for (const e of pend) {
    const phone = e.whatsapp_contatos?.phone
    if (!phone) continue
    /* respeita a trava: se o dono assumiu essa conversa, não manda */
    if (await donoAssumiuConversa(admin, e.contato_id)) continue

    const nome = (e.whatsapp_contatos?.nome ?? '').split(' ')[0] || 'tudo bem'
    const msg = `Oi ${nome}! 😊 Passando só pra lembrar daquelas perguntinhas rápidas pro cadastro. Quando puder me responder, é rapidinho! 🙏`

    let messageId: string | undefined
    try { messageId = (await sendWhatsAppMessage({ phone, message: msg })).messageId }
    catch { continue }

    const ts = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: e.contato_id, message_id: messageId ?? null,
      direcao: 'enviada', tipo: 'texto', conteudo: msg, status: 'enviada', timestamp: ts,
      raw: { origem: 'ia' },
    })
    await admin.from('whatsapp_contatos').update({ ultima_mensagem: msg, ultima_mensagem_at: ts }).eq('id', e.contato_id)

    /* mantém a conversa: adiciona ao histórico e atualiza o marcador
       pra o executor só considerar o que a pessoa mandar DEPOIS */
    const hist = [...(Array.isArray(e.historico) ? e.historico : []), { papel: 'agente', texto: msg }]
    await admin.from('agente_conversa_estado').update({
      historico: hist,
      dados_coletados: { ...(e.dados_coletados ?? {}), _ultima_msg_ts: ts },
      updated_at: ts,
    }).eq('id', e.id)

    enviados++
  }

  return enviados
}
