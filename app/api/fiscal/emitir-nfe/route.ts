import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { montarNfePayload, type DestinatarioNfe } from '@/lib/fiscal/nfe'
import type { FiscalCfg } from '@/lib/fiscal/nfce'
import { emitirNfe, consultarNfe, ambienteDaLoja } from '@/lib/fiscal/focus'
import { logErro } from '@/lib/log-erro'

export const maxDuration = 60

/* Emite a NF-e (modelo 55) de uma venda, com os dados completos do
   destinatário. ref = nfe-<id> (idempotente). Salva em notas_fiscais. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let vendaId: string
  let dest: DestinatarioNfe
  try {
    const b = await request.json()
    vendaId = b.vendaId
    dest = b.destinatario
  } catch { return new NextResponse('Invalid JSON', { status: 400 }) }
  if (!vendaId) return NextResponse.json({ ok: false, erro: 'vendaId obrigatório' }, { status: 400 })

  /* Validação mínima do destinatário */
  const docDig = (dest?.documento ?? '').replace(/\D/g, '')
  if (!dest?.nome?.trim()) return NextResponse.json({ ok: false, erro: 'Informe o nome/razão social do destinatário.' })
  if (docDig.length !== 11 && docDig.length !== 14) return NextResponse.json({ ok: false, erro: 'CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.' })
  if (!dest?.logradouro?.trim() || !dest?.municipio?.trim() || !dest?.uf?.trim() || (dest?.cep ?? '').replace(/\D/g, '').length !== 8) {
    return NextResponse.json({ ok: false, erro: 'Endereço incompleto (logradouro, município, UF e CEP são obrigatórios).' })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const [{ data: venda }, { data: cfg }] = await Promise.all([
    admin.from('vendas').select('id, forma_pagamento, produtos, valor').eq('id', vendaId).eq('user_id', user.id).maybeSingle(),
    admin.from('loja_config').select('fiscal_ativo, fiscal_ambiente, fiscal_cnpj, fiscal_razao_social, fiscal_ie, fiscal_regime, fiscal_csc, fiscal_csc_id, fiscal_cep, fiscal_logradouro, fiscal_numero, fiscal_bairro, fiscal_municipio, fiscal_uf, fiscal_cod_municipio').eq('user_id', user.id).maybeSingle(),
  ])
  if (!venda) return NextResponse.json({ ok: false, erro: 'Venda não encontrada.' }, { status: 404 })
  if (!cfg?.fiscal_ativo) return NextResponse.json({ ok: false, erro: 'Emissão fiscal desligada (ligue em Configurações → Fiscal).' })

  const prods = Array.isArray(venda.produtos) ? venda.produtos as { estoque_id?: string }[] : []
  const ids = [...new Set(prods.map(p => p.estoque_id).filter(Boolean))] as string[]
  const estoqueById = new Map<string, { id: string; ncm?: string | null; cfop?: string | null; categoria?: string | null }>()
  if (ids.length) {
    const { data: itens } = await admin.from('estoque').select('id, ncm, cfop, categoria').in('id', ids)
    for (const it of (itens ?? [])) estoqueById.set(it.id, it)
  }

  const amb = ambienteDaLoja(cfg.fiscal_ambiente)
  const ref = `nfe-${vendaId}`
  const payload = montarNfePayload(venda, cfg as FiscalCfg, estoqueById, dest)

  try {
    let r = await emitirNfe(ref, payload, amb)
    let d = r.data as { status?: string; numero?: string; serie?: string; chave_nfe?: string; caminho_danfe?: string; caminho_xml_nota_fiscal?: string; mensagem_sefaz?: string; erros?: unknown }
    if (r.ok && (!d?.status || d.status === 'processando_autorizacao')) {
      await new Promise(res => setTimeout(res, 3000))
      const c = await consultarNfe(ref, amb)
      if (c.data) { r = c; d = c.data as typeof d }
    }

    const status = d?.status === 'autorizado' ? 'autorizado'
      : (d?.status && d.status !== 'processando_autorizacao') ? 'erro' : 'processando'
    const base = amb === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br'

    await admin.from('notas_fiscais').upsert({
      user_id: user.id, venda_id: vendaId, ref, ambiente: amb,
      status,
      numero: d?.numero ?? null,
      chave: d?.chave_nfe ?? null,
      url_danfe: d?.caminho_danfe ? `${base}${d.caminho_danfe}` : null,
      url_xml: d?.caminho_xml_nota_fiscal ? `${base}${d.caminho_xml_nota_fiscal}` : null,
      mensagem: d?.mensagem_sefaz ?? (d?.erros ? JSON.stringify(d.erros).slice(0, 500) : null),
      raw: d ?? null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'user_id,ref' })

    if (!r.ok || status === 'erro') {
      return NextResponse.json({ ok: false, status, mensagem: d?.mensagem_sefaz ?? d?.erros ?? 'Falha na emissão da NF-e', raw: d })
    }
    return NextResponse.json({ ok: true, status, numero: d?.numero, url_danfe: d?.caminho_danfe ? `${base}${d.caminho_danfe}` : null })
  } catch (err) {
    await logErro('fiscal/emitir-nfe', err, { vendaId }, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}
