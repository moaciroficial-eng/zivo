import type { FiscalCfg } from '@/lib/fiscal/nfce'

/* ══════════════════════════════════════════════════════════════
   MONTADOR DA NF-e (modelo 55) — a nota "cheia", pra quando o cliente
   (ou a empresa dele) exige. Mesmas regras de item do cupom (Simples,
   CSOSN 102, NCM do produto, CFOP de saída 5102, PIS/COFINS CST 49),
   mas com os DADOS COMPLETOS do destinatário.
   ══════════════════════════════════════════════════════════════ */

export type DestinatarioNfe = {
  tipo: 'PF' | 'PJ'
  documento: string          // CPF ou CNPJ (só dígitos)
  nome: string               // nome ou razão social
  ie?: string | null         // inscrição estadual (PJ contribuinte)
  cep: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  complemento?: string | null
  email?: string | null
}

type ProdutoVenda = { nome?: string; qtd?: number; preco_unitario?: number; desconto?: number; estoque_id?: string }
type EstoqueLite = { id: string; ncm?: string | null; cfop?: string | null; categoria?: string | null }
type Venda = { forma_pagamento?: string | null; produtos?: unknown }

const NCM_POR_CATEGORIA: Record<string, string> = {
  tenis: '64039990', chinelo: '64022000',
  camiseta: '61091000', regata: '61091000', polo: '61051000', blusa: '61061000',
  camisa: '62052000', calca: '62034200', bermuda: '62034300',
  cueca: '61071100', meia: '61159500', bone: '65050090', acessorios: '62179000',
}
const NCM_FALLBACK = '62179000'

function ncmDoProduto(e: EstoqueLite | undefined): string {
  const n = (e?.ncm ?? '').replace(/\D/g, '')
  if (n.length === 8) return n
  const cat = (e?.categoria ?? '').toLowerCase()
  return NCM_POR_CATEGORIA[cat] ?? NCM_FALLBACK
}

function formaPagamentoCodigo(fp: string | null | undefined): string {
  const f = (fp ?? '').toLowerCase()
  if (f.includes('dinheiro')) return '01'
  if (f.includes('pix')) return '17'
  if (f.includes('debito') || f.includes('débito')) return '04'
  if (f.includes('credito') || f.includes('crédito') || f.includes('cartao') || f.includes('cartão') || f.includes('mercado')) return '03'
  if (f.includes('crediario') || f.includes('crediário')) return '05'
  return '99'
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function montarNfePayload(venda: Venda, cfg: FiscalCfg, estoqueById: Map<string, EstoqueLite>, dest: DestinatarioNfe): Record<string, any> {
  const prods = (Array.isArray(venda.produtos) ? venda.produtos : []) as ProdutoVenda[]

  let totalProdutos = 0
  let totalDesconto = 0
  const items = prods.map((p, i) => {
    const qtd = Number(p.qtd) || 1
    const unit = r2(Number(p.preco_unitario) || 0)
    const bruto = r2(unit * qtd)
    const desc = r2(Number(p.desconto) || 0)
    totalProdutos += bruto
    totalDesconto += desc
    const est = p.estoque_id ? estoqueById.get(p.estoque_id) : undefined
    const cfopProd = (est?.cfop ?? '').replace(/\D/g, '')
    const cfop = /^[56]\d{3}$/.test(cfopProd) ? cfopProd : '5102'
    return {
      numero_item: i + 1,
      codigo_produto: p.estoque_id?.slice(0, 12) ?? String(i + 1),
      descricao: (p.nome ?? 'Produto').slice(0, 120),
      cfop,
      unidade_comercial: 'UN',
      quantidade_comercial: qtd,
      valor_unitario_comercial: unit,
      valor_bruto: bruto,
      unidade_tributavel: 'UN',
      quantidade_tributavel: qtd,
      valor_unitario_tributavel: unit,
      codigo_ncm: ncmDoProduto(est),
      icms_origem: '0',
      icms_situacao_tributaria: '102',   // CSOSN Simples
      pis_situacao_tributaria: '49',
      pis_base_calculo: 0,
      pis_aliquota_porcentual: 0,
      pis_valor: 0,
      cofins_situacao_tributaria: '49',
      cofins_base_calculo: 0,
      cofins_aliquota_porcentual: 0,
      cofins_valor: 0,
      ...(desc > 0 ? { valor_desconto: desc } : {}),
    }
  })

  const totalNota = r2(totalProdutos - totalDesconto)
  const doc = dest.documento.replace(/\D/g, '')
  const ehPJ = dest.tipo === 'PJ' || doc.length === 14
  const temIE = !!(dest.ie && dest.ie.trim())

  /* mesmo UF da loja = operação interna (1), senão interestadual (2) */
  const interna = (cfg.fiscal_uf ?? '').toUpperCase() === (dest.uf ?? '').toUpperCase()

  const destinatario = {
    nome_destinatario: dest.nome.slice(0, 60),
    ...(ehPJ ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    ...(ehPJ && temIE
      ? { indicador_inscricao_estadual_destinatario: '1', inscricao_estadual_destinatario: (dest.ie ?? '').replace(/\D/g, '') }
      : { indicador_inscricao_estadual_destinatario: '9' }),  // não contribuinte
    logradouro_destinatario: dest.logradouro,
    numero_destinatario: dest.numero || 'S/N',
    ...(dest.complemento ? { complemento_destinatario: dest.complemento } : {}),
    bairro_destinatario: dest.bairro,
    municipio_destinatario: dest.municipio,
    uf_destinatario: (dest.uf ?? '').toUpperCase(),
    cep_destinatario: (dest.cep ?? '').replace(/\D/g, ''),
    pais_destinatario: 'Brasil',
    ...(dest.email ? { email_destinatario: dest.email } : {}),
  }

  return {
    natureza_operacao: 'Venda ao consumidor',
    data_emissao: new Date().toISOString(),
    tipo_documento: '1',            // saída
    finalidade_emissao: '1',        // normal
    consumidor_final: '1',
    presenca_comprador: '1',        // presencial
    modalidade_frete: '9',          // sem frete
    local_destino: interna ? '1' : '2',
    cnpj_emitente: (cfg.fiscal_cnpj ?? '').replace(/\D/g, ''),
    ...destinatario,
    valor_frete: 0,
    valor_seguro: 0,
    valor_outras_despesas: 0,
    valor_desconto: r2(totalDesconto),
    valor_produtos: r2(totalProdutos),
    valor_total: totalNota,
    items,
    formas_pagamento: [
      { forma_pagamento: formaPagamentoCodigo(venda.forma_pagamento), valor_pagamento: totalNota },
    ],
  }
}
