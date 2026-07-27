import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { normalizarTelefoneBR } from '@/lib/whatsapp'

export const maxDuration = 120

const MAX_POR_DISPARO = 50

/* Teaser 1 linha pro {{3}} do template (Meta não aceita quebra) */
function teaser(msg: string): string {
  let t = String(msg || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(oi|ol[áa]|e a[íi]|opa)\b[^!.?]*[!.?]\s*/i, '')
  if (t.length > 90) t = t.slice(0, 88).replace(/\s+\S*$/, '') + '…'
  return t || 'novidades que combinam com o seu estilo'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { titulo, objetivo, copy_texto, publico_ids } = await request.json()
  if (!copy_texto || !Array.isArray(publico_ids) || publico_ids.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Faltou copy ou público.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'

  const alvo = publico_ids.slice(0, MAX_POR_DISPARO)

  const [{ data: clientes }, { data: contatos }] = await Promise.all([
    admin.from('clientes').select('id, nome, telefone').eq('user_id', user.id).in('id', alvo),
    admin.from('whatsapp_contatos').select('id, phone, cliente_id').eq('user_id', user.id).limit(3000),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contatoPorCliente = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (contatos ?? []) as any[]) if (c.cliente_id) contatoPorCliente.set(c.cliente_id, c)
  const contatoPorFone = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (contatos ?? []) as any[]) if (c.phone) contatoPorFone.set(String(c.phone).replace(/\D/g, '').slice(-8), c.id)

  let porTemplate = 0, porTexto = 0, falhas = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const cli of (clientes ?? []) as any[]) {
    const primeiroNome = (cli.nome as string | null)?.split(' ')[0] || 'você'
    const textoPersonalizado = String(copy_texto).replace(/\{nome\}/gi, primeiroNome)

    /* resolve telefone + contato */
    let phone: string | null = null
    let contatoId: string | null = null
    const ct = contatoPorCliente.get(cli.id)
    if (ct?.phone) { phone = ct.phone; contatoId = ct.id }
    else if (cli.telefone) {
      phone = normalizarTelefoneBR(cli.telefone)
      contatoId = contatoPorFone.get(String(cli.telefone).replace(/\D/g, '').slice(-8)) ?? null
    }
    if (!phone) { falhas++; continue }

    const r = await enviarOferta(admin, {
      userId: user.id,
      contatoId,
      phone,
      texto: textoPersonalizado,
      templateName: 'novidade_loja',
      templateVars: [primeiroNome, nomeLoja, teaser(textoPersonalizado)],
      creds: loja?.creds,
    })
    if (!r.ok) { falhas++; continue }
    if (r.via === 'template') porTemplate++; else porTexto++

    /* cadência */
    try {
      await admin.from('inteligencia_acoes').insert({ user_id: user.id, cliente_id: cli.id, mensagem: textoPersonalizado, enviada_em: new Date().toISOString() })
    } catch { /* ignora */ }
  }

  /* registra a campanha no histórico */
  try {
    await admin.from('campanhas').insert({
      user_id: user.id, nome: titulo || 'Campanha', objetivo: objetivo ?? null,
      copy_whatsapp: copy_texto, status: 'ativa',
    })
  } catch { /* histórico secundário */ }

  return NextResponse.json({
    ok: true,
    enviados: porTemplate + porTexto,
    por_template: porTemplate,
    por_texto: porTexto,
    falhas,
    excedente: publico_ids.length - alvo.length,
  })
}
