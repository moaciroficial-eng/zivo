import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getLoja } from '@/lib/loja'
import { processarLoteDisparo } from '@/lib/campanhas/disparo-template'

export const maxDuration = 60

/* Processa um lote de envios pendentes ("agora"). O navegador chama esta
   rota repetidas vezes (com uma pequena pausa entre chamadas) até acabar
   -- mesmo padrão da foto de produto: nunca uma chamada só gigante que
   arrisca estourar o timeout da função serverless. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: disparo } = await admin.from('disparo_templates').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!disparo) return NextResponse.json({ ok: false, erro: 'Disparo não encontrado.' }, { status: 404 })

  const loja = await getLoja(admin, user.id).catch(() => null)
  const resultado = await processarLoteDisparo(admin, id, loja?.creds)
  return NextResponse.json({ ok: true, ...resultado })
}
