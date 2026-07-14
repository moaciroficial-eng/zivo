import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { gerarCampanhaOcasiao, resolverPublico } from '@/lib/inteligencia/campanhas'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { ocasiao } = await request.json()
  if (!ocasiao) return NextResponse.json({ ok: false, erro: 'ocasião obrigatória' }, { status: 400 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const proposta = await gerarCampanhaOcasiao(admin, user.id, ocasiao)
  if (!proposta.ok) return NextResponse.json({ ok: false, erro: proposta.erro })

  /* Resolve o público (código, não modelo) pra mostrar quantos vão receber */
  const publico = await resolverPublico(admin, user.id, ocasiao, proposta.publico_criterio)

  return NextResponse.json({
    ok: true,
    proposta,
    total_publico: publico.length,
    amostra: publico.slice(0, 12).map(c => c.nome),
  })
}
