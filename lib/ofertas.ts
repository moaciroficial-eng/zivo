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

/* ══════════════════════════════════════════════════════════════
   IDENTIFICAÇÃO DO PRODUTO POR TRÁS DE UMA FOTO ENVIADA

   Usado tanto pra listar o histórico de fotos de uma conversa (copiar
   oferta antiga) quanto pra identificar a peça citada numa resposta do
   cliente (quadrinho "respondendo a ..."). Dois caminhos:
   1. A foto tem ofertaId -> casa pelo foto_url dentro das pecas da oferta
      (preço de/por exatos, negociados na hora).
   2. Sem ofertaId (foto antiga, de antes desse rastreamento) -> tenta
      casar nome/marca da legenda (formato "Nome Marca — de R$X por R$Y")
      com o estoque atual.
   ══════════════════════════════════════════════════════════════ */

const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

function parseBRL(s: string): number | null {
  const n = Number(s.replace('R$', '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseLegendaOferta(caption: string | null | undefined): { base: string; de: number | null; por: number | null } {
  if (!caption) return { base: '', de: null, por: null }
  const partes = caption.split(' — ')
  const base = (partes[0] ?? '').trim()
  const precoParte = (partes[1] ?? '').trim()
  if (!precoParte) return { base, de: null, por: null }
  const deEPor = precoParte.match(/^de (R\$[\d.,]+) por (R\$[\d.,]+)$/)
  if (deEPor) return { base, de: parseBRL(deEPor[1]), por: parseBRL(deEPor[2]) }
  const soPreco = precoParte.match(/^(R\$[\d.,]+)$/)
  if (soPreco) return { base, de: null, por: parseBRL(soPreco[1]) }
  return { base, de: null, por: null }
}

export type TamanhoQtd = { tamanho: string | number; qtd: number }
export type EstoqueRow = { id: string; nome: string; marca: string | null; status?: string | null; tamanhos: TamanhoQtd[] | null }

export function acharEstoquePorNome(estoque: EstoqueRow[], base: string): EstoqueRow | null {
  const nb = norm(base)
  if (!nb) return null
  const candidatos = estoque.filter(e => {
    const n = norm(e.nome)
    if (!n || !nb.includes(n)) return false
    if (e.marca && !nb.includes(norm(e.marca))) return false
    return true
  })
  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => norm(b.nome).length - norm(a.nome).length)
  return candidatos[0]
}

export type ImageRaw = { imageUrl?: string; caption?: string | null; ofertaId?: string | null }
export type ProdutoResolvido = {
  encontrado: boolean
  estoque_id?: string
  nome?: string
  marca?: string | null
  tamanhos?: string[]
  preco_de?: number | null
  preco_por?: number | null
}

/* ofertaPorId: ofertas já carregadas (id -> pecas). estoque: tabela inteira do dono. */
export function resolverProdutoDaImagem(
  img: ImageRaw,
  ofertaPorId: Map<string, { id: string; pecas: PecaOferta[] }>,
  estoque: EstoqueRow[],
): ProdutoResolvido {
  if (img.ofertaId) {
    const of = ofertaPorId.get(img.ofertaId)
    const peca = of?.pecas?.find(p => p.foto_url === img.imageUrl)
    if (peca) {
      return {
        encontrado: true, estoque_id: peca.estoque_id, nome: peca.nome, marca: peca.marca,
        tamanhos: peca.tamanhos, preco_de: peca.preco_de, preco_por: peca.preco_por,
      }
    }
  }

  const { base, de, por } = parseLegendaOferta(img.caption)
  const e = acharEstoquePorNome(estoque, base)
  if (!e) return { encontrado: false }

  const tamanhosAtuais = (e.tamanhos ?? []).filter(t => Number(t.qtd) > 0).map(t => String(t.tamanho))
  return {
    encontrado: true, estoque_id: e.id, nome: e.nome, marca: e.marca,
    tamanhos: tamanhosAtuais, preco_de: de, preco_por: por ?? de,
  }
}
