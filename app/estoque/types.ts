export type TamanhoQtd = { tamanho: string; qtd: number }

export type Produto = {
  id: string
  user_id: string
  nome: string
  marca: string | null
  categoria: 'camiseta' | 'calca' | 'tenis' | 'outros'
  tamanhos: TamanhoQtd[]
  preco_custo: number | null
  preco_venda: number | null
  created_at: string
}
