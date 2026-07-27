import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'

/* Teaser curto (1 linha, sem quebra) pro {{3}} do template novidade_loja
   — Meta não aceita quebra de linha em variável. Tira a saudação e corta. */
function teaserTemplate(msg: string): string {
  let t = String(msg || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(oi|ol[áa]|e a[íi]|opa)\b[^!.?]*[!.?]\s*/i, '')
  if (t.length > 90) t = t.slice(0, 88).replace(/\s+\S*$/, '') + '…'
  return t || 'novidades que combinam com o seu estilo'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { contatoId, mensagem, logId, clienteId, sugestaoId } = await request.json()
  if (!contatoId || !mensagem) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: contato } = await admin
    .from('whatsapp_contatos')
    .select('phone, nome')
    .eq('id', contatoId)
    .single()

  if (!contato?.phone) return NextResponse.json({ ok: false, error: 'Contato sem telefone' }, { status: 400 })

  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'
  const primeiroNome = (contato.nome as string | null)?.split(' ')[0] || 'você'

  /* Braço de execução: janela aberta → copy livre; fechada → template
     "novidade_loja" (abridor aprovado). Nunca "some". */
  const resultado = await enviarOferta(admin, {
    userId: user.id,
    contatoId,
    phone: contato.phone,
    texto: mensagem,
    templateName: 'novidade_loja',
    templateVars: [primeiroNome, nomeLoja, teaserTemplate(mensagem)],
    creds: loja?.creds,
  })

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.erro ?? 'Falha no envio' }, { status: 502 })
  }

  /* Marca log como executado */
  if (logId) {
    await admin.from('agente_logs').update({ acao: `✓ ENVIADO (${resultado.via}) — ${mensagem}` }).eq('id', logId)
  }

  /* Cadência: evita reenviar pro mesmo cliente em poucos dias */
  if (clienteId) {
    try {
      await admin.from('inteligencia_acoes').insert({
        user_id: user.id, cliente_id: clienteId, mensagem, enviada_em: new Date().toISOString(),
      })
    } catch { /* ignora */ }
  }

  /* Resolve a sugestão aprovada */
  if (sugestaoId) {
    await admin.from('agente_sugestoes').update({ status: 'resolvida' })
      .eq('id', sugestaoId).eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true, via: resultado.via })
}
