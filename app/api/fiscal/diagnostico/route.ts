import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ehFundador } from '@/lib/fundador'
import { focusAmbiente, focusConfigurada, listarEmpresas } from '@/lib/fiscal/focus'

/* Teste de conexão com a Focus NFe — só o fundador. Confirma que o token
   do ambiente está funcionando (lista as empresas da conta). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!ehFundador(user.email)) return new NextResponse('Forbidden', { status: 403 })

  if (!focusConfigurada()) {
    return NextResponse.json({
      ok: false,
      ambiente: focusAmbiente(),
      motivo: 'Token não configurado. Adicione FOCUS_NFE_TOKEN_HOMOLOGACAO no Vercel.',
    })
  }

  const r = await listarEmpresas()
  const empresas = Array.isArray(r.data) ? (r.data as { cnpj?: string; nome_fantasia?: string; razao_social?: string }[]) : []
  return NextResponse.json({
    ok: r.ok,
    ambiente: focusAmbiente(),
    status: r.status,
    total_empresas: empresas.length,
    empresas: empresas.slice(0, 20).map(e => ({ cnpj: e.cnpj, nome: e.nome_fantasia || e.razao_social })),
    raw: r.ok ? undefined : r.data,
  })
}
