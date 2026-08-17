/* Rate limiter em memória (best-effort).

   Em serverless cada instância tem o próprio mapa, então NÃO é uma barreira
   perfeita — mas corta brute-force e spam triviais vindos de uma mesma origem
   (ex.: chutar telefone no login do Clube, floodar o webhook de convite).
   Para escala real, trocar por Upstash/Redis com chave compartilhada. */

type Janela = { count: number; reset: number }

const baldes = new Map<string, Janela>()

/* Retorna true se a requisição É PERMITIDA, false se estourou o limite. */
export function rateLimit(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now()

  /* Limpeza oportunista pra o mapa não crescer sem fim */
  if (baldes.size > 5000) {
    for (const [k, v] of baldes) if (agora > v.reset) baldes.delete(k)
  }

  const b = baldes.get(chave)
  if (!b || agora > b.reset) {
    baldes.set(chave, { count: 1, reset: agora + janelaMs })
    return true
  }
  if (b.count >= limite) return false
  b.count++
  return true
}

/* Extrai o IP da requisição (atrás do proxy da Vercel). */
export function ipDaRequisicao(req: Request): string {
  const h = req.headers
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'desconhecido'
  )
}
