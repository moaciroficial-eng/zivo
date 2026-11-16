import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/* Resultado de um disparo: quantos enviados/entregues/lidos/falharam, e a
   lista individual (com o motivo de quem falhou e o contato pra abrir a
   conversa de quem respondeu). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: disparo } = await admin.from('disparo_templates')
    .select('id, template_name, status, total_destinatarios, created_at')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!disparo) return NextResponse.json({ ok: false, erro: 'Disparo não encontrado.' }, { status: 404 })

  const { data: envios } = await admin.from('disparo_template_envios')
    .select('id, nome, phone, contato_id, status, motivo_falha')
    .eq('disparo_id', id).order('created_at', { ascending: true })

  const lista = envios ?? []
  const contatoIds = lista.map(e => e.contato_id).filter(Boolean) as string[]

  /* Respostas: contatos deste disparo que mandaram msg RECEBIDA depois do envio */
  let respondeuPorContato = new Set<string>()
  if (contatoIds.length) {
    const { data: msgs } = await admin.from('whatsapp_mensagens')
      .select('contato_id').in('contato_id', contatoIds).eq('direcao', 'recebida').gte('timestamp', disparo.created_at)
    respondeuPorContato = new Set((msgs ?? []).map((m: { contato_id: string }) => m.contato_id))
  }

  const contagem = { pendente: 0, enviado: 0, entregue: 0, lido: 0, falhou: 0 }
  for (const e of lista) contagem[e.status as keyof typeof contagem] = (contagem[e.status as keyof typeof contagem] ?? 0) + 1

  return NextResponse.json({
    ok: true,
    disparo,
    contagem,
    respostas: respondeuPorContato.size,
    envios: lista.map(e => ({
      nome: e.nome, status: e.status, motivo: e.motivo_falha,
      contatoId: e.contato_id, respondeu: e.contato_id ? respondeuPorContato.has(e.contato_id) : false,
    })),
  })
}
