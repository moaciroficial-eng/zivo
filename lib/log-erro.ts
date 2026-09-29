import { createClient } from '@supabase/supabase-js'

/* ── Captura de erros (Sentry caseiro) ──────────────────────────────
   Registra um erro do servidor na tabela app_erros pra o dono enxergar
   depois no painel. É best-effort: NUNCA lança (se o log falhar, o fluxo
   principal segue). Sem serviço externo, sem custo. */
export async function logErro(
  rota: string,
  err: unknown,
  contexto?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const admin = createClient(url, key)
    const mensagem = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? (err.stack ?? null) : null
    await admin.from('app_erros').insert({
      user_id: userId ?? null,
      rota,
      mensagem: mensagem.slice(0, 2000),
      stack: stack ? stack.slice(0, 6000) : null,
      contexto: contexto ?? null,
    })
  } catch {
    /* silencioso de propósito — o log não pode derrubar o fluxo */
  }
  // Mantém o rastro no console também (aparece nos logs da Vercel)
  try { console.error(`[erro:${rota}]`, err) } catch { /* ignore */ }
}
