import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { clienteServeProduto } from '@/lib/tamanhos'
import { NextRequest, NextResponse } from 'next/server'

/* Lista produtos do estoque QUE TÊM FOTO na biblioteca, pra mandar no chat.
   Sabe o tamanho do cliente (via contato) e marca quais peças servem nele,
   ordenando as que servem primeiro. Busca por nome/marca/cor (sem acento). */

const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

type TamanhoQtd = { tamanho: string | number; qtd: number }

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { contatoId, q } = await request.json() as { contatoId?: string; q?: string }
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Tamanhos do cliente (se o contato estiver vinculado a um cliente)
  let tamsCliente: (string | null)[] = []
  if (contatoId) {
    const { data: c } = await admin.from('whatsapp_contatos').select('cliente_id').eq('id', contatoId).maybeSingle()
    if (c?.cliente_id) {
      const { data: cli } = await admin.from('clientes')
        .select('tamanho_camiseta, tamanho_calca, tamanho_tenis')
        .eq('id', c.cliente_id).maybeSingle()
      if (cli) tamsCliente = [cli.tamanho_camiseta, cli.tamanho_calca, cli.tamanho_tenis]
    }
  }

  const [{ data: estoque }, { data: fotos }] = await Promise.all([
    admin.from('estoque').select('id, nome, marca, cor, preco_venda, tamanhos, genero, status')
      .eq('user_id', user.id).not('status', 'eq', 'vendido'),
    admin.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', user.id),
  ])

  // estoque_id → url da foto
  const fotoDe = new Map<string, string>()
  for (const f of (fotos ?? [])) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoDe.has(id)) fotoDe.set(id, f.url)
  }

  const termos = norm(q ?? '').split(/\s+/).filter(Boolean)

  const itens = (estoque ?? [])
    .filter(e => fotoDe.has(e.id))
    .map(e => {
      const tams = ((e.tamanhos as TamanhoQtd[]) ?? []).filter(t => Number(t.qtd) > 0)
      const tamanhosDisp = tams.map(t => String(t.tamanho))
      const serve = tamsCliente.some(Boolean)
        ? clienteServeProduto(tamsCliente, tamanhosDisp)
        : false
      const haystack = norm([e.nome, e.marca, e.cor].filter(Boolean).join(' '))
      const casa = termos.length === 0 || termos.every(t => haystack.includes(t))
      return { e, tams, tamanhosDisp, serve, casa }
    })
    .filter(x => x.casa && x.tamanhosDisp.length > 0)
    .sort((a, b) => Number(b.serve) - Number(a.serve))
    .slice(0, 30)
    .map(x => ({
      estoque_id: x.e.id,
      nome: x.e.nome,
      marca: x.e.marca,
      cor: x.e.cor,
      preco_venda: x.e.preco_venda,
      foto_url: fotoDe.get(x.e.id)!,
      tamanhos: x.tamanhosDisp,
      serve: x.serve,
    }))

  return NextResponse.json({ ok: true, itens, temCliente: tamsCliente.some(Boolean) })
}
