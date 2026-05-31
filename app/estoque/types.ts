export type TamanhoQtd = { tamanho: string; qtd: number }

export type Produto = {
  id: string
  user_id: string
  nome: string
  marca: string | null
  codigo_produto: string | null
  cor: string | null
  categoria: 'camiseta' | 'calca' | 'tenis' | 'outros'
  tamanhos: TamanhoQtd[]
  preco_custo: number | null
  preco_venda: number | null
  ncm: string | null
  cfop: string | null
  icms: string | null
  pis: string | null
  cofins: string | null
  cest: string | null
  created_at: string
}
