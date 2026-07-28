import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { clientesParaProduto, limparNomeProduto } from '@/lib/inteligencia/oportunidades'

/* Clientes que casam com UM produto (ação no card do produto do plano) +
   uma copy pronta (e editável) por cliente. */

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { produtoId, produtoNome, marca } = await request.json()
  if (!produtoId) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const casados = await clientesParaProduto(admin, user.id, produtoId).catch(() => [])

  const nomeLimpo = limparNomeProduto(produtoNome ?? casados[0]?.produtoNome ?? '', marca ?? casados[0]?.marca)
  const saud = saudacaoBR()
  const marcaTxt = (marca ?? casados[0]?.marca) ? ` da ${marca ?? casados[0]?.marca}` : ''

  const clientes = casados.map(o => {
    const primeiro = o.clienteNome.split(' ')[0]
    const copy = `${saud} ${primeiro}! Chegou ${nomeLimpo}${marcaTxt} aqui na loja no ${o.tamanho} e achei muito a sua cara. Passa pra ver ou me fala que te mando as fotos!`
    return { clienteId: o.clienteId, nome: o.clienteNome, telefone: o.telefone, tamanho: o.tamanho, motivo: o.motivo, copy }
  })

  return NextResponse.json({ ok: true, nomeLimpo, clientes })
}
