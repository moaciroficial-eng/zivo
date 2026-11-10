import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { clientesParaProduto, limparNomeProduto } from '@/lib/inteligencia/oportunidades'
import { construirCopyOportunidadesComIA } from '@/lib/inteligencia/copy'

/* Clientes que casam com UM produto (ação no card do produto do plano) +
   uma copy pronta (e editável) por cliente — mesmo gerador compartilhado
   com o feed de Oportunidades e o "Quem chamar hoje" do Painel. */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { produtoId, produtoNome, marca } = await request.json()
  if (!produtoId) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const casados = await clientesParaProduto(admin, user.id, produtoId).catch(() => [])

  const nomeLimpo = limparNomeProduto(produtoNome ?? casados[0]?.produtoNome ?? '', marca ?? casados[0]?.marca)

  /* Só os 5 que MAIS se encaixam (já vem ordenado por score) */
  const feed = await construirCopyOportunidadesComIA(admin, casados.slice(0, 5))
  const clientes = feed.map(o => ({ clienteId: o.clienteId, nome: o.clienteNome, telefone: o.telefone, tamanho: o.tamanho, motivo: o.motivo, copy: o.copy }))

  return NextResponse.json({ ok: true, nomeLimpo, clientes })
}
