/* ══════════════════════════════════════════════════════════════
   VIGIA DE CONVERSAS PENDENTES — rede de segurança final.

   Se por qualquer motivo uma resposta de cliente em tarefa ativa
   ficar sem processamento (função que morreu, timeout, deploy no
   meio), este vigia detecta e reprocessa. Roda a cada mensagem
   recebida na loja (carona no webhook), então se cura sozinho em
   minutos. O executor tem trava + marcador _ultima_msg_ts, então
   redisparar algo já processado é inofensivo (skip).
   ══════════════════════════════════════════════════════════════ */

const ESPERA_MINIMA_MS = 3 * 60_000   // não confunde com processamento em andamento
const MAX_REDISPAROS = 3              // por varredura

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function varrerConversasPendentes(admin: any, userId: string): Promise<number> {
  const desde48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: estados } = await admin
    .from('agente_conversa_estado')
    .select('tarefa_id, contato_id, updated_at')
    .eq('user_id', userId)
    .eq('status', 'aguardando')
    .gte('updated_at', desde48h)
    .limit(20)

  const agora = Date.now()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  let redisparadas = 0

  for (const e of (estados ?? []) as { tarefa_id: string; contato_id: string; updated_at: string }[]) {
    if (redisparadas >= MAX_REDISPAROS) break

    /* Última mensagem recebida do contato */
    const { data: ult } = await admin
      .from('whatsapp_mensagens')
      .select('timestamp')
      .eq('contato_id', e.contato_id)
      .eq('direcao', 'recebida')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ult?.timestamp) continue

    const tRecebida = new Date(ult.timestamp).getTime()
    const tProcessado = new Date(e.updated_at).getTime()

    /* Pendente: o cliente falou DEPOIS do último processamento e já faz
       tempo suficiente pra não ser um processamento em andamento */
    if (tRecebida > tProcessado && agora - tRecebida > ESPERA_MINIMA_MS) {
      await fetch(`${baseUrl}/api/gerente/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
        body: JSON.stringify({ userId, tarefaId: e.tarefa_id, contatoId: e.contato_id }),
      }).catch(() => null)
      redisparadas++
    }
  }

  return redisparadas
}
