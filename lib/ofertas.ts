/* Helpers compartilhados entre as rotas de oferta (salvar, copiar, encaminhar).
   Não importa lib/whatsapp.ts pra poder futuramente reaproveitar em client
   components sem arrastar código de envio -- hoje só é usado no servidor. */

export type PecaOferta = {
  estoque_id: string
  nome: string
  marca: string | null
  foto_url: string
  tamanhos: string[]
  preco_de: number | null
  preco_por: number | null
}

export function fmtPrecoBRL(n: number): string {
  return `R$${n.toFixed(2).replace('.', ',')}`
}

/* Mesma regra da legenda de foto no chat: nunca mostra %, só o valor em R$
   -- "de/por" quando o preço final é menor que o original. */
export function legendaOferta(p: PecaOferta): string {
  const base = [p.nome, p.marca].filter(Boolean).join(' ')
  if (p.preco_por == null) return base
  if (p.preco_de != null && p.preco_por < p.preco_de) {
    return `${base} — de ${fmtPrecoBRL(p.preco_de)} por ${fmtPrecoBRL(p.preco_por)}`
  }
  return `${base} — ${fmtPrecoBRL(p.preco_por)}`
}
