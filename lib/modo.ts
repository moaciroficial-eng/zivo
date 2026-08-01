import { cookies } from 'next/headers'
import { createHash } from 'crypto'

/* Modo funcionária — restrição de acesso no MESMO login da loja, protegida
   por PIN. É uma trava operacional (esconde métricas sensíveis, limita preço
   e desconto), não um isolamento de segurança forte: como o navegador tem a
   sessão do dono, é adequado pra uso no balcão, não contra alguém técnico. */

export type Modo = 'dono' | 'funcionaria'
export const COOKIE_MODO = 'zivo_modo'

/* Lê o modo atual no servidor (Server Components / rotas). */
export async function getModo(): Promise<Modo> {
  const store = await cookies()
  return store.get(COOKIE_MODO)?.value === 'funcionaria' ? 'funcionaria' : 'dono'
}

/* Hash do PIN — sha256(userId:pin). Suficiente pra uma trava de balcão. */
export function hashPin(userId: string, pin: string): string {
  return createHash('sha256').update(`${userId}:${String(pin).trim()}`).digest('hex')
}

/* Limite de desconto que a funcionária pode aplicar numa venda. */
export const DESCONTO_MAX_FUNCIONARIA = 60
