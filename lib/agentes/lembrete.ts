import { donoAssumiuConversa } from '@/lib/whatsapp'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'

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

    const primeiroNome = (e.whatsapp_contatos?.nome ?? '').split(' ')[0] || 'tudo bem'
    const msg = `Oi ${primeiroNome}! 😊 Passando só pra lembrar daquelas perguntinhas rápidas pro cadastro. Quando puder me responder, é rapidinho! 🙏`

    /* Window-aware: se o contato ficou frio de novo (24h desde a abertura),
       o texto livre falharia — reusa o template atualizacao_cadastro. */
    const loja = await getLoja(admin, userId).catch(() => null)
    const r = await enviarOferta(admin, {
      userId, contatoId: e.contato_id, phone,
      texto: msg, templateName: 'atualizacao_cadastro',
      templateVars: [primeiroNome, loja?.nomeLoja || 'a loja'], creds: loja?.creds,
    })
    if (!r.ok) continue

    const ts = new Date().toISOString()
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
