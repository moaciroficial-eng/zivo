/* ══════════════════════════════════════════════════════════════
   ASSINATURA (SaaS) — planos, estado e helpers

   Começa em teste grátis (14 dias). Vira "ativa" quando o pagamento
   recorrente é aprovado no gateway. O bloqueio real só acontece se
   BILLING_ENFORCE=1 (pra não travar ninguém antes da cobrança existir).
   ══════════════════════════════════════════════════════════════ */

export type PlanoId = 'essencial' | 'pro'

export const PLANOS: Record<PlanoId, { nome: string; preco: number; descricao: string }> = {
  essencial: { nome: 'Essencial', preco: 97, descricao: 'Oportunidades do dia, plano de vendas, atendimento e importação.' },
  pro:       { nome: 'Pro',       preco: 197, descricao: 'Tudo do Essencial + Consultora de Campanhas, automações e aprendizado.' },
}

export type Assinatura = {
  user_id: string
  plano: PlanoId | null
  status: 'trial' | 'ativa' | 'inadimplente' | 'cancelada'
  trial_ate: string
  gateway: string | null
  gateway_sub_id: string | null
  proximo_vencimento: string | null
}

/* Gateway configurado? (chaves no ambiente) */
export function cobrancaConfigurada(): boolean {
  return !!(process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN.trim())
}

/* Deve bloquear o acesso? Só quando o enforce está ligado E não está ativa/trial. */
export function billingEnforce(): boolean {
  return process.env.BILLING_ENFORCE === '1'
}

export type StatusResumo = {
  ativo: boolean          // pode usar o app
  emTrial: boolean
  diasTrial: number       // dias restantes de teste (0 se acabou)
  bloqueado: boolean      // enforce ligado + sem acesso
  rotulo: string          // texto curto pro banner
}

export function resumoAssinatura(a: Assinatura | null): StatusResumo {
  const agora = Date.now()
  if (!a) {
    return { ativo: true, emTrial: true, diasTrial: 14, bloqueado: false, rotulo: 'Teste grátis' }
  }
  const trialMs = new Date(a.trial_ate).getTime()
  const emTrial = a.status === 'trial' && trialMs > agora
  const diasTrial = emTrial ? Math.max(0, Math.ceil((trialMs - agora) / 86400000)) : 0
  const ativo = a.status === 'ativa' || emTrial
  const bloqueado = billingEnforce() && !ativo
  const rotulo =
    a.status === 'ativa' ? `Plano ${a.plano ? PLANOS[a.plano].nome : 'ativo'}`
    : emTrial ? `Teste grátis — ${diasTrial} dia${diasTrial === 1 ? '' : 's'} restante${diasTrial === 1 ? '' : 's'}`
    : a.status === 'inadimplente' ? 'Pagamento pendente'
    : a.status === 'trial' ? 'Teste encerrado'
    : 'Assinatura cancelada'
  return { ativo, emTrial, diasTrial, bloqueado, rotulo }
}

/* Garante uma linha de assinatura pro usuário (cria em trial se não existir). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function garantirAssinatura(admin: any, userId: string): Promise<Assinatura> {
  const { data } = await admin.from('assinaturas').select('*').eq('user_id', userId).maybeSingle()
  if (data) return data as Assinatura
  const { data: nova } = await admin.from('assinaturas').insert({ user_id: userId }).select('*').single()
  return nova as Assinatura
}
