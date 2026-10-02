/* ══════════════════════════════════════════════════════════════
   MONTADOR DA NFC-e — transforma uma venda do Terny no JSON da Focus.

   Simples Nacional (CSOSN 102), consumidor final presencial. NCM vem do
   produto; se faltar, usa um padrão por categoria pra a nota autorizar
   (o dono/contabilidade refina depois). Valores em número (2 casas).
   ══════════════════════════════════════════════════════════════ */

export type FiscalCfg = {
  fiscal_cnpj: string | null
  fiscal_razao_social: string | null
  fiscal_ie: string | null
  fiscal_regime: string | null
  fiscal_csc: string | null
  fiscal_csc_id: string | null
  fiscal_cep: string | null
  fiscal_logradouro: string | null
  fiscal_numero: string | null
  fiscal_bairro: string | null
  fiscal_municipio: string | null
  fiscal_uf: string | null
  fiscal_cod_municipio: string | null
}

type ProdutoVenda = { nome?: string; qtd?: number; preco_unitario?: number; desconto?: number; estoque_id?: string }
type EstoqueLite = { id: string; ncm?: string | null; cfop?: string | null; categoria?: string | null }
type Venda = { forma_pagamento?: string | null; produtos?: unknown; cliente_cpf?: string | null; cliente_nome?: string | null }

/* NCM padrão por categoria (aproximado — refinar com a contabilidade) */
const NCM_POR_CATEGORIA: Record<string, string> = {
  tenis: '64039990', chinelo: '64022000', // calçados
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

/* forma de pagamento do Terny → código da NFC-e */
function formaPagamentoCodigo(fp: string | null | undefined): string {
  const f = (fp ?? '').toLowerCase()
  if (f.includes('dinheiro')) return '01'
  if (f.includes('pix')) return '17'
  if (f.includes('debito') || f.includes('débito')) return '04'
  if (f.includes('credito') || f.includes('crédito') || f.includes('cartao') || f.includes('cartão') || f.includes('mercadopago') || f.includes('mercado')) return '03'
  if (f.includes('crediario') || f.includes('crediário')) return '05' // crédito loja
  return '99' // outros
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function montarNfcePayload(venda: Venda, cfg: FiscalCfg, estoqueById: Map<string, EstoqueLite>): Record<string, any> {
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
    /* CFOP de SAÍDA (venda). O cfop guardado no produto costuma ser o de
       COMPRA (entrada: 1xxx/2xxx) vindo da importação da NF-e — inválido num
       cupom de venda. Só aceita um 5xxx do produto; senão usa 5102 (padrão
       Simples, dentro do estado, consumidor final). */
    const cfopProd = (est?.cfop ?? '').replace(/\D/g, '')
    const cfop = /^5\d{3}$/.test(cfopProd) ? cfopProd : '5102'
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
      codigo_ncm: ncmDoProduto(est),    // Focus usa "codigo_ncm" (não "ncm")
      icms_origem: '0',                 // nacional
      icms_situacao_tributaria: '102',  // CSOSN Simples Nacional (sem crédito)
      /* PIS/COFINS no Simples Nacional: CST 49 (outras operações), valor zero.
         Pagos na DAS; no cupom vão padronizados — não é dado por produto.
         CEST não entra: só vale com ICMS-ST (CSOSN de ST), não com o 102. */
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
  const cpf = (venda.cliente_cpf ?? '').replace(/\D/g, '')

  return {
    cnpj_emitente: (cfg.fiscal_cnpj ?? '').replace(/\D/g, ''),
    data_emissao: new Date().toISOString(),
    /* Série e numeração são controladas NA CONTA FOCUS (serie_nfce_producao /
       proximo_numero_nfce_producao da empresa) — o campo "serie" no payload é
       ignorado. A loja da Moca usa série 2 (o Nex usa a 1). Séries 900-999 são
       reservadas pra homologação, não servem em produção. */
    presenca_comprador: '1',        // presencial
    modalidade_frete: '9',          // sem frete
    local_destino: '1',             // operação interna
    natureza_operacao: 'Venda ao consumidor',
    ...(cpf.length === 11 ? { cpf_destinatario: cpf, nome_destinatario: (venda.cliente_nome ?? '').slice(0, 60) || undefined } : {}),
    valor_frete: 0,
    valor_desconto: r2(totalDesconto),
    valor_produtos: r2(totalProdutos),
    valor_total: totalNota,
    items,
    formas_pagamento: [
      { forma_pagamento: formaPagamentoCodigo(venda.forma_pagamento), valor_pagamento: totalNota },
    ],
  }
}
