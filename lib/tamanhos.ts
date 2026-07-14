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

/* Quebra um valor que pode conter DOIS tamanhos ("38 e 40", "38/40",
   "38 ou 40", "38,40") numa lista de tamanhos individuais normalizados. */
export function separarTamanhos(valor: unknown): string[] {
  return String(valor ?? '')
    .replace(/\b(e|ou)\b/gi, '/')
    .split(/[\/,;\s]+/)
    .map(p => norm(p))
    .filter(p => p && p !== 'E' && p !== 'OU')
}

/* Junta dois tamanhos no formato canônico de armazenamento: "38/40" */
export function juntarTamanhos(valor: unknown): string {
  return separarTamanhos(valor).join('/')
}

/* Expande um tamanho (ou par "38/40") em TODAS as formas equivalentes.
   "40" → ["40","M"]  |  "M" → ["M","40","42"]  |  "38/40" → ["38","P","40","M"] */
export function expandirTamanho(tamanho: unknown): string[] {
  const set = new Set<string>()
  for (const t of separarTamanhos(tamanho)) {
    set.add(t)
    if (NUM_PARA_LETRA[t]) set.add(NUM_PARA_LETRA[t])
    if (LETRA_PARA_NUMS[t]) for (const n of LETRA_PARA_NUMS[t]) set.add(n)
  }
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
