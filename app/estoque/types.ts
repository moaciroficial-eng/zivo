export type TamanhoQtd = { tamanho: string; qtd: number }

export type Produto = {
  id: string
  user_id: string
  nome: string
  marca: string | null
  codigo_produto: string | null
  cor: string | null
  genero: 'M' | 'F' | 'U' | 'I' | null
  categoria: 'camiseta' | 'camisa' | 'regata' | 'calca' | 'bermuda' | 'polo' | 'tenis' | 'chinelo' | 'outros'
  manga: 'curta' | 'longa' | null
  tamanhos: TamanhoQtd[]
  preco_custo: number | null
  preco_venda: number | null
  ncm: string | null
  cfop: string | null
  icms: string | null
  pis: string | null
  cofins: string | null
  cest: string | null
  codigo_barras: string | null
  status: 'disponivel' | 'aguardando_recebimento' | 'em_condicional'
  nfe_grupo_id: string | null
  condicional_com: string | null
  condicional_tel: string | null
  condicional_desde: string | null
  created_at: string
}

export type NfeGrupoMeta = {
  grupoId: string
  emitente: string | null
  num_nfe: string | null
  total_itens: number
  data: string
}
