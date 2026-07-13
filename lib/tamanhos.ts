/* ══════════════════════════════════════════════════════════════
   EQUIVALÊNCIA DE TAMANHOS — número ↔ letra (parte de baixo)

   O cliente informa a numeração da calça (38, 40, 42...). No estoque,
   uma bermuda pode estar como "M". A equivalência fica AQUI, escondida
   na inteligência — o cliente nunca vê essa complexidade.

   Tabela padrão de moda masculina/feminina BR para calça/bermuda.
   ══════════════════════════════════════════════════════════════ */

/* Numeração → letra equivalente (parte de baixo) */
const NUM_PARA_LETRA: Record<string, string> = {
  '34': 'PP', '36': 'P', '38': 'P',
  '40': 'M', '42': 'M',
  '44': 'G', '46': 'G',
  '48': 'GG', '50': 'GG',
  '52': 'XGG', '54': 'XGG',
}

/* Letra → numerações equivalentes (parte de baixo) */
const LETRA_PARA_NUMS: Record<string, string[]> = {
  'PP': ['34'],
  'P':  ['36', '38'],
  'M':  ['40', '42'],
  'G':  ['44', '46'],
  'GG': ['48', '50'],
  'XGG': ['52', '54'],
}

function norm(t: unknown): string {
  return String(t ?? '').trim().toUpperCase().replace(/\s/g, '')
}

/* Expande um tamanho em TODAS as suas formas equivalentes.
   "40" → ["40", "M"]  |  "M" → ["M", "40", "42"] */
export function expandirTamanho(tamanho: unknown): string[] {
  const t = norm(tamanho)
  if (!t) return []
  const set = new Set<string>([t])
  if (NUM_PARA_LETRA[t]) set.add(NUM_PARA_LETRA[t])
  if (LETRA_PARA_NUMS[t]) for (const n of LETRA_PARA_NUMS[t]) set.add(n)
  return [...set]
}

/* Dois tamanhos representam o mesmo corpo? (aceita número vs letra) */
export function tamanhosEquivalentes(a: unknown, b: unknown): boolean {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const exp = expandirTamanho(na)
  return exp.includes(nb)
}

/* Algum tamanho do cliente casa com algum tamanho disponível no produto? */
export function clienteServeProduto(tamanhosCliente: unknown[], tamanhosProduto: unknown[]): boolean {
  const doCliente = tamanhosCliente.flatMap(expandirTamanho)
  const doProduto = new Set(tamanhosProduto.flatMap(expandirTamanho))
  return doCliente.some(t => doProduto.has(t))
}
