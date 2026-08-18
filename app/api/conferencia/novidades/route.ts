import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { clienteServeProduto } from '@/lib/tamanhos'

/* Pós-conferência: "chegou marca X → quais clientes avisar".
   Agrupa os produtos recebidos por marca e, pra cada marca, lista os clientes
   que curtem aquela marca (compras reais + insights) e servem no tamanho que
   chegou. Não envia nada — só monta a lista pro dono revisar e disparar. */

function generoOposto(produtoGen: string | null, clienteGen: string | null): boolean {
  const p = String(produtoGen ?? '').toUpperCase().charAt(0)
  const c = String(clienteGen ?? '').toUpperCase().charAt(0)
  if (p !== 'M' && p !== 'F') return false
  if (c !== 'M' && c !== 'F') return false
  return p !== c
}

type TamanhoItem = { tamanho: string | number; qtd: number }
type ClienteRow = {
  id: string; nome: string | null; telefone: string | null; genero: string | null
  tamanho_camiseta: string | null; tamanho_calca: string | null; tamanho_tenis: string | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { grupoId, incluirVazias } = await request.json() as { grupoId: string; incluirVazias?: boolean }
  if (!grupoId) return NextResponse.json({ ok: false, erro: 'grupoId ausente' }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  /* 1. Produtos recebidos nesta nota, agrupados por marca */
  const { data: recebidos } = await admin.from('estoque')
    .select('id, nome, marca, tamanhos, preco_venda, genero')
    .eq('nfe_grupo_id', grupoId).eq('user_id', user.id)

  type MarcaGrupo = {
    marca: string; qtdPecas: number; produtos: string[]
    tamanhos: Set<string>; genero: string | null
  }
  const porMarca = new Map<string, MarcaGrupo>()
  for (const r of (recebidos ?? [])) {
    if (!r.marca) continue
    const key = String(r.marca).toLowerCase().trim()
    const tams = ((r.tamanhos as TamanhoItem[]) ?? []).filter(t => Number(t.qtd) > 0)
    const g: MarcaGrupo = porMarca.get(key) ?? { marca: r.marca, qtdPecas: 0, produtos: [] as string[], tamanhos: new Set<string>(), genero: r.genero }
    g.qtdPecas += tams.reduce((s, t) => s + Number(t.qtd), 0) || 1
    if (!g.produtos.includes(r.nome)) g.produtos.push(r.nome)
    for (const t of tams) g.tamanhos.add(String(t.tamanho))
    if (!g.genero && r.genero) g.genero = r.genero
    porMarca.set(key, g)
  }
  if (porMarca.size === 0) return NextResponse.json({ ok: true, marcas: [] })

  /* 2. Clientes + histórico de marca (compras reais e insights) */
  const [{ data: clientes }, { data: vendas }, { data: insights }, { data: estoqueAll }] = await Promise.all([
    admin.from('clientes')
      .select('id, nome, telefone, genero, tamanho_camiseta, tamanho_calca, tamanho_tenis')
      .eq('user_id', user.id),
    admin.from('vendas').select('cliente_id, produtos').eq('user_id', user.id),
    admin.from('contato_insights').select('cliente_id, marcas_favoritas').eq('user_id', user.id),
    admin.from('estoque').select('id, marca').eq('user_id', user.id),
  ])

  const estoqueMarca = new Map<string, string>()
  for (const e of (estoqueAll ?? [])) if (e.marca) estoqueMarca.set(e.id, String(e.marca).toLowerCase().trim())

  // cliente_id → Map<marcaLower, nº de compras dessa marca>
  const marcasPorCliente = new Map<string, Map<string, number>>()
  for (const v of (vendas ?? [])) {
    if (!v.cliente_id) continue
    const itens = Array.isArray(v.produtos) ? v.produtos : []
    for (const p of itens) {
      const marca = (p?.marca ?? (p?.estoque_id ? estoqueMarca.get(p.estoque_id) : null))
      if (!marca) continue
      const key = String(marca).toLowerCase().trim()
      const m = marcasPorCliente.get(v.cliente_id) ?? new Map<string, number>()
      m.set(key, (m.get(key) ?? 0) + 1)
      marcasPorCliente.set(v.cliente_id, m)
    }
  }
  // supplement com marcas_favoritas dos insights (peso baixo)
  for (const i of (insights ?? [])) {
    if (!i.cliente_id || !Array.isArray(i.marcas_favoritas)) continue
    const m = marcasPorCliente.get(i.cliente_id) ?? new Map<string, number>()
    for (const mf of i.marcas_favoritas) {
      const key = String(mf).toLowerCase().trim()
      if (!m.has(key)) m.set(key, 1)
    }
    marcasPorCliente.set(i.cliente_id, m)
  }

  /* 3. Pra cada marca recebida, casa os clientes que curtem + servem no tamanho */
  const resultado = [...porMarca.values()].map(g => {
    const marcaKey = g.marca.toLowerCase().trim()
    const tamanhosDisp = [...g.tamanhos]

    const alvos = (clientes as ClienteRow[] ?? [])
      .map(c => {
        if (!c.telefone) return null
        const compras = marcasPorCliente.get(c.id)?.get(marcaKey) ?? 0
        if (compras === 0) return null
        if (generoOposto(g.genero, c.genero)) return null
        const serve = tamanhosDisp.length === 0
          || clienteServeProduto([c.tamanho_camiseta, c.tamanho_calca, c.tamanho_tenis], tamanhosDisp)
        if (!serve) return null
        return {
          id: c.id,
          nome: c.nome ?? 'Cliente',
          telefone: c.telefone,
          compras,
          motivo: compras > 1 ? `${compras} compras da ${g.marca}` : `já comprou ${g.marca}`,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.compras - a.compras)
      .slice(0, 40)

    return {
      marca: g.marca,
      qtdPecas: g.qtdPecas,
      produtos: g.produtos.slice(0, 6),
      tamanhos: tamanhosDisp,
      clientes: alvos,
    }
  })
  .filter(m => incluirVazias || m.clientes.length > 0)
  .sort((a, b) => b.clientes.length - a.clientes.length)

  return NextResponse.json({ ok: true, marcas: resultado })
}
