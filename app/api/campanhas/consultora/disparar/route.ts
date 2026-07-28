import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { enviarOferta } from '@/lib/agentes/envio'
import { getLoja } from '@/lib/loja'
import { normalizarTelefoneBR } from '@/lib/whatsapp'

export const maxDuration = 120

const MAX_POR_DISPARO = 50

/* {saudacao} → Bom dia/Boa tarde/Boa noite pela hora do BRASIL (rede de
   segurança; o app já troca antes de enviar). */
function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

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

  const { titulo, objetivo, marca, copy_texto, publico_ids, foto_url, produto_ids, data_evento, lembretes } = await request.json()
  if (!copy_texto || !Array.isArray(publico_ids) || publico_ids.length === 0) {
    return NextResponse.json({ ok: false, erro: 'Faltou copy ou público.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const loja = await getLoja(admin, user.id).catch(() => null)
  const nomeLoja = loja?.nomeLoja || 'a loja'

  const alvo = publico_ids.slice(0, MAX_POR_DISPARO)

  /* Fotos que o cliente recebe QUANDO RESPONDER (a copy pergunta "quer que
     eu te mande as fotos?"). Prioridade pra foto de venda que o DONO subiu;
     se ele não subiu, cai na foto da biblioteca do produto (fallback). */
  let fotosResposta: string[] = []
  if (foto_url) {
    fotosResposta = [foto_url]
  } else if (Array.isArray(produto_ids) && produto_ids.length > 0) {
    const { data: fotos } = await admin.from('biblioteca_fotos')
      .select('url').eq('user_id', user.id).overlaps('estoque_ids', produto_ids).limit(6)
    fotosResposta = [...new Set((fotos ?? []).map((f: { url: string }) => f.url).filter(Boolean))].slice(0, 5)
  }
  let comFotoNaResposta = 0

  /* Cria a campanha ANTES do disparo pra linkar os leads (rastrear resultado) */
  const { data: campanhaRow } = await admin.from('campanhas').insert({
    user_id: user.id, nome: titulo || 'Campanha', objetivo: objetivo ?? null,
    produto_marca: marca ?? null, copy_whatsapp: copy_texto, tipo: 'interna', status: 'ativa',
  }).select('id').single()
  const campanhaId: string | null = campanhaRow?.id ?? null

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
  const enviadosCli: string[] = []   // clientes que receberam (pra agendar os lembretes)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const cli of (clientes ?? []) as any[]) {
    const primeiroNome = (cli.nome as string | null)?.split(' ')[0] || 'você'
    const textoPersonalizado = String(copy_texto).replace(/\{saudacao\}/gi, saudacaoBR()).replace(/\{nome\}/gi, primeiroNome)

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
      fotoUrl: foto_url ?? null,
      templateFotoName: 'oferta_com_foto',
      creds: loja?.creds,
    })
    if (!r.ok) { falhas++; continue }
    if (r.via === 'template') porTemplate++; else porTexto++

    /* Só fica pendente pra quem NÃO recebeu a foto agora (nem inline nem via
       template com imagem). O enviarOferta já avisa com fotoInclusa. */
    const pendentes = r.fotoInclusa ? [] : fotosResposta

    /* lead da campanha (rastreia resultado depois) */
    if (campanhaId) {
      try {
        await admin.from('campanha_leads').insert({
          user_id: user.id, campanha_id: campanhaId, cliente_id: cli.id,
          contato_id: contatoId, phone, nome: cli.nome ?? null, status: 'novo',
        })
        if (contatoId) await admin.from('whatsapp_contatos').update({
          campanha_id: campanhaId,
          ...(pendentes.length ? { fotos_pendentes: pendentes } : {}),
        }).eq('id', contatoId)
        if (pendentes.length) comFotoNaResposta++
      } catch { /* lead é secundário */ }
    }

    /* cadência */
    try {
      await admin.from('inteligencia_acoes').insert({ user_id: user.id, cliente_id: cli.id, mensagem: textoPersonalizado, enviada_em: new Date().toISOString() })
    } catch { /* ignora */ }

    enviadosCli.push(cli.id)
  }

  /* ── Agenda os LEMBRETES da cadência (o cron dispara no dia certo) ──
     enviar_em = data do evento - dias_antes, às 09:00 do Brasil (=12:00 UTC). */
  let lembretesAgendados = 0
  if (campanhaId && data_evento && Array.isArray(lembretes) && lembretes.length && enviadosCli.length) {
    const agora = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (const lem of lembretes as { dias_antes: number; copy: string; fotoUrl?: string | null }[]) {
      if (!lem?.copy?.trim()) continue
      const base = new Date(`${String(data_evento).slice(0, 10)}T12:00:00.000Z`)
      if (isNaN(base.getTime())) continue
      base.setUTCDate(base.getUTCDate() - (Number(lem.dias_antes) || 0))
      if (base.getTime() <= agora) continue  // já passou
      const enviarEm = base.toISOString()
      for (const cid of enviadosCli) {
        rows.push({
          user_id: user.id, tipo: 'campanha_lembrete', cliente_id: cid, campanha_id: campanhaId,
          conteudo: lem.copy, foto_url: lem.fotoUrl ?? null, enviar_em: enviarEm, enviada: false,
        })
      }
    }
    if (rows.length) {
      /* insere em lotes pra não estourar o payload */
      for (let i = 0; i < rows.length; i += 500) {
        try { await admin.from('mensagens_agendadas').insert(rows.slice(i, i + 500)) } catch { /* segue */ }
      }
      lembretesAgendados = new Set(rows.map(r => r.enviar_em)).size
    }
  }

  return NextResponse.json({
    ok: true,
    campanhaId,
    enviados: porTemplate + porTexto,
    por_template: porTemplate,
    por_texto: porTexto,
    fotos_no_retorno: comFotoNaResposta,
    lembretes_agendados: lembretesAgendados,
    falhas,
    excedente: publico_ids.length - alvo.length,
  })
}
