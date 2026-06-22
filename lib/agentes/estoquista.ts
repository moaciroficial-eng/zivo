import { SupabaseClient } from '@supabase/supabase-js'

type TamanhoItem = { tamanho: string; qtd: number }
type EstoqueItem = {
  id: string; nome: string; marca: string; cor: string | null
  tamanhos: TamanhoItem[]; preco_venda: number; status: string
}

export async function diagnosticoEstoque(admin: SupabaseClient, userId: string): Promise<string> {
  const { data: itens } = await admin
    .from('estoque')
    .select('id, nome, marca, cor, tamanhos, preco_venda, status')
    .eq('user_id', userId)
    .eq('status', 'disponivel')

  if (!itens?.length) return '📦 Nenhum produto cadastrado no estoque ainda.'

  const produtos = itens as EstoqueItem[]

  const criticos: EstoqueItem[] = []
  const baixos: EstoqueItem[] = []
  const ok: EstoqueItem[] = []

  for (const p of produtos) {
    const total = (p.tamanhos as TamanhoItem[]).reduce((s, t) => s + (t.qtd || 0), 0)
    if (total === 0) criticos.push(p)
    else if (total <= 3) baixos.push(p)
    else ok.push(p)
  }

  const valorTotal = produtos.reduce((s, p) => {
    const unidades = (p.tamanhos as TamanhoItem[]).reduce((ss, t) => ss + (t.qtd || 0), 0)
    return s + unidades * Number(p.preco_venda)
  }, 0)

  const partes = [
    `📦 *Diagnóstico do Estoque*`,
    '',
    `Total de SKUs: ${produtos.length}`,
    `Valor estimado em estoque: R$ ${valorTotal.toFixed(2)}`,
    '',
  ]

  if (criticos.length) {
    partes.push(`🔴 Zerados (${criticos.length}):`)
    criticos.slice(0, 5).forEach(p => partes.push(`  • ${p.nome}${p.cor ? ` ${p.cor}` : ''}`))
    if (criticos.length > 5) partes.push(`  ... e mais ${criticos.length - 5}`)
    partes.push('')
  }

  if (baixos.length) {
    partes.push(`🟡 Críticos ≤3 unid. (${baixos.length}):`)
    baixos.slice(0, 5).forEach(p => {
      const total = (p.tamanhos as TamanhoItem[]).reduce((s, t) => s + (t.qtd || 0), 0)
      partes.push(`  • ${p.nome}${p.cor ? ` ${p.cor}` : ''}: ${total} un.`)
    })
    if (baixos.length > 5) partes.push(`  ... e mais ${baixos.length - 5}`)
    partes.push('')
  }

  partes.push(`✅ Bem estocados: ${ok.length} produto(s)`)

  if (criticos.length === 0 && baixos.length === 0) {
    partes.push('\n🏆 Estoque saudável! Tudo com quantidade adequada.')
  } else {
    partes.push(`\n⚠️ Ação recomendada: repor ${criticos.length + baixos.length} produto(s) antes de acabar.`)
  }

  return partes.join('\n')
}

export async function buscarProduto(admin: SupabaseClient, userId: string, busca: string): Promise<string> {
  const [r1, r2] = await Promise.all([
    admin.from('estoque').select('id,nome,marca,cor,tamanhos,preco_venda')
      .eq('user_id', userId).eq('status', 'disponivel').ilike('nome', `%${busca}%`).limit(50),
    admin.from('estoque').select('id,nome,marca,cor,tamanhos,preco_venda')
      .eq('user_id', userId).eq('status', 'disponivel').ilike('marca', `%${busca}%`).limit(50),
  ])

  const visto = new Set<string>()
  const itens: EstoqueItem[] = []
  for (const { data } of [r1, r2]) {
    for (const item of (data ?? []) as EstoqueItem[]) {
      if (!visto.has(item.id)) { visto.add(item.id); itens.push(item) }
    }
  }

  const comEstoque = itens.filter(i => (i.tamanhos as TamanhoItem[]).some(t => t.qtd > 0))

  if (!comEstoque.length) return `📦 Nenhum "${busca}" disponível no estoque.`

  const lista = comEstoque.map(i => {
    const tam = (i.tamanhos as TamanhoItem[])
      .filter(t => t.qtd > 0)
      .map(t => `${t.tamanho}(${t.qtd})`)
      .join(' ')
    const cor = i.cor ? ` ${i.cor}` : ''
    return `• ${i.nome}${cor} — ${tam} — R$${Number(i.preco_venda).toFixed(2)}`
  }).join('\n')

  return `📦 *${busca}* (${comEstoque.length} item/itens)\n${lista}`
}
