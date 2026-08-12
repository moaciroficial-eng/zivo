import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getModo } from '@/lib/modo'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas — Zivo' }

function calcResumoServer(vs: Array<{ forma_pagamento: string | null; valor: number }>) {
  const r: Record<string, number> = {}
  for (const v of vs) {
    const fp = v.forma_pagamento || ''
    if (!fp) {
      r['outros'] = (r['outros'] || 0) + Number(v.valor)
    } else if (fp.includes('+')) {
      fp.split('+').forEach(p => {
        const [m, amount] = p.split(':')
        const key = m?.startsWith('credito_') ? 'credito' : (m ?? 'outros')
        r[key] = (r[key] || 0) + (parseFloat(amount) || 0)
      })
    } else {
      const key = fp.startsWith('credito_') ? 'credito' : fp
      r[key] = (r[key] || 0) + Number(v.valor)
    }
  }
  return r
}

export default async function VendasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const d = new Date(today + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  const tomorrow = d.toISOString().split('T')[0]

  const [{ data: vendas }, { data: clientes }, { data: estoque }, { data: crediarios }, { data: insights }, { data: fotos }] = await Promise.all([
    supabase.from('vendas').select('*').eq('user_id', user.id).order('data_venda', { ascending: false }),
    supabase.from('clientes').select('id, nome, dependentes, saldo_credito, observacoes').eq('user_id', user.id).order('nome'),
    supabase.from('estoque').select('id, nome, marca, cor, codigo_barras, codigo_produto, preco_venda, preco_custo, status, tamanhos')
      .eq('user_id', user.id).not('status', 'eq', 'vendido').order('nome'),
    supabase.from('crediario').select('*, parcelas_crediario(*)').eq('user_id', user.id)
      .eq('status', 'aberto').order('created_at', { ascending: false }),
    /* marca principal por cliente — pra sugerir a observação na venda */
    supabase.from('contato_insights').select('cliente_id, marca_principal, fidelidade_marca').eq('user_id', user.id),
    supabase.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', user.id),
  ])

  /* Mapa produtoId → foto (miniatura na busca de venda) */
  const fotoMap: Record<string, string> = {}
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] | null }[]) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoMap[id]) fotoMap[id] = f.url
  }

  /* Mapa cliente_id → marca principal (só quando há afinidade real) */
  const marcaPorCliente: Record<string, string> = {}
  for (const i of (insights ?? []) as { cliente_id: string | null; marca_principal: string | null }[]) {
    if (i.cliente_id && i.marca_principal) marcaPorCliente[i.cliente_id] = i.marca_principal
  }

  let { data: caixaAtual } = await supabase.from('caixas')
    .select('*').eq('user_id', user.id).eq('status', 'aberto').maybeSingle()

  // Auto-fecha caixa de dia anterior que ficou aberto
  if (caixaAtual && !caixaAtual.data_abertura.startsWith(today)) {
    const vendasDoCaixa = (vendas ?? []).filter(v => v.caixa_id === caixaAtual!.id)
    const totalVendas = vendasDoCaixa.reduce((s, v) => s + Number(v.valor), 0)
    const resumo = calcResumoServer(vendasDoCaixa)
    const valorEsperado = Number(caixaAtual.troco_inicial) + (resumo['dinheiro'] || 0)
    await supabase.from('caixas').update({
      data_fechamento: new Date().toISOString(),
      total_vendas: totalVendas,
      resumo_pagamentos: resumo,
      valor_esperado: valorEsperado,
      status: 'fechado',
    }).eq('id', caixaAtual.id)
    caixaAtual = null
  }

  // Auto-abre caixa do dia se ainda não existe nenhum (aberto ou fechado) hoje
  if (!caixaAtual) {
    const { data: caixasHoje } = await supabase.from('caixas')
      .select('id').eq('user_id', user.id)
      .gte('data_abertura', today).lt('data_abertura', tomorrow)
      .limit(1)

    if (!caixasHoje?.length) {
      const { data: novoCaixa } = await supabase.from('caixas').insert({
        user_id: user.id,
        troco_inicial: 0,
        status: 'aberto',
      }).select().single()
      caixaAtual = novoCaixa
    }
  }

  const { data: historicoCaixas } = await supabase.from('caixas').select('*')
    .eq('user_id', user.id).eq('status', 'fechado')
    .order('data_fechamento', { ascending: false }).limit(20)

  // Modo funcionária: só mostra vendas do mês atual (esconde meses anteriores)
  // e não mostra o histórico de caixas fechados.
  const modo = await getModo()
  const inicioMes = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`
  const vendasVisiveis = modo === 'funcionaria'
    ? (vendas ?? []).filter(v => String(v.data_venda) >= inicioMes)
    : (vendas ?? [])

  return (
    <VendasClient
      user={{ id: user.id, email: user.email ?? '' }}
      initialVendas={vendasVisiveis}
      clientes={clientes ?? []}
      estoqueItems={estoque ?? []}
      caixaAtual={caixaAtual ?? null}
      historicoCaixas={modo === 'funcionaria' ? [] : (historicoCaixas ?? [])}
      initialCrediarios={crediarios ?? []}
      marcaPorCliente={marcaPorCliente}
      fotoMap={fotoMap}
      modo={modo}
    />
  )
}
