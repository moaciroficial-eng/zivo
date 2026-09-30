import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { registrarEmpresaFocus } from '@/lib/fiscal/empresa'
import { logErro } from '@/lib/log-erro'
import { NextResponse } from 'next/server'

/* Registra a loja do usuário logado na Focus NFe (usa os dados fiscais +
   o certificado já salvos). Rode uma vez, depois de subir o certificado.
   Aceita POST (botão) e GET (abrir o link direto, à prova de cache). */
async function handle() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  try {
    const r = await registrarEmpresaFocus(admin, user.id)
    return NextResponse.json({ ok: r.ok, status: r.status, data: r.data })
  } catch (err) {
    await logErro('fiscal/registrar-empresa', err, undefined, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}

export const POST = handle
export const GET = handle
