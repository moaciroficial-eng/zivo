import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getLoja, lojaOriginalUserId } from '@/lib/loja'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

/* Diagnóstico do canal de WhatsApp — responde só BOOLEANOS e o nome do
   provedor, nunca token/credencial. Serve pra descobrir por que um envio
   caiu no provedor errado. */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const uid = lojaOriginalUserId()

  const env = {
    WHATSAPP_USER_ID: !!uid,
    SUPABASE_URL: !!url,
    SERVICE_ROLE_KEY: !!key,
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER ?? '(não definido → zapi)',
    META_ACCESS_TOKEN_env: !!process.env.META_ACCESS_TOKEN,
    ZAPI_TOKEN_env: !!process.env.ZAPI_TOKEN,
  }

  if (!url || !key || !uid) {
    return NextResponse.json({ ok: false, motivo: 'env faltando', env })
  }

  const loja = await getLoja(createClient(url, key), uid).catch(e => ({ erro: String(e) } as never))
  if (!loja || 'erro' in loja) {
    return NextResponse.json({ ok: false, motivo: 'loja não encontrada pelo WHATSAPP_USER_ID', env, detalhe: loja })
  }

  /* ?contatos=<fragmento telefone> → lista contatos que casam + contagem de
     mensagens de cada um. Revela contato "rachado" (preview num, mensagens
     noutro). Só dígitos, mostra telefone mascarado. */
  const frag = request.nextUrl.searchParams.get('contatos')?.replace(/\D/g, '')
  if (frag) {
    const admin = createClient(url, key)
    const { data: contatos } = await admin
      .from('whatsapp_contatos')
      .select('id, phone, nome, ultima_mensagem, ultima_mensagem_at')
      .eq('user_id', uid)
      .ilike('phone', `%${frag.slice(-8)}%`)
      .limit(20)
    const linhas = []
    for (const c of contatos ?? []) {
      const { count } = await admin
        .from('whatsapp_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('contato_id', c.id)
      linhas.push({
        contato_id: c.id,
        phone_mascarado: `...${String(c.phone).slice(-6)}`,
        nome: c.nome,
        msgs: count ?? 0,
        ultima: c.ultima_mensagem?.slice(0, 30),
        ultima_at: c.ultima_mensagem_at,
      })
    }
    return NextResponse.json({ ok: true, fragmento: frag.slice(-8), contatos: linhas })
  }

  /* ?testar=<fragmento telefone>&msg=<pergunta>
     Executa o atendimento REAL para esse contato e devolve a resposta crua
     do endpoint — que já diz o motivo quando ele decide não responder
     ('inativo', 'throttled', 'dono ativo na conversa', erro de envio...).
     Sem isso a falha era invisível: tudo acontece em fetch fire-and-forget. */
  const testar = request.nextUrl.searchParams.get('testar')?.replace(/\D/g, '')
  if (testar) {
    const admin = createClient(url, key)
    const { data: contatos } = await admin
      .from('whatsapp_contatos')
      .select('id, phone, nome')
      .eq('user_id', uid)
      .ilike('phone', `%${testar.slice(-8)}%`)
      .limit(1)
    const alvo = contatos?.[0]
    if (!alvo) return NextResponse.json({ ok: false, motivo: 'contato não encontrado', fragmento: testar.slice(-8) })

    const msg = request.nextUrl.searchParams.get('msg') || 'que horas vocês abrem?'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
    let resposta: unknown = null
    let httpStatus: number | null = null
    try {
      const r = await fetch(`${baseUrl}/api/agentes/atendimento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
        body: JSON.stringify({ contatoId: alvo.id, userId: uid, mensagem: msg }),
      })
      httpStatus = r.status
      resposta = await r.json().catch(() => null)
    } catch (e) {
      resposta = { erroFetch: e instanceof Error ? e.message : String(e) }
    }
    return NextResponse.json({
      ok: true,
      contato: { nome: alvo.nome, phone_mascarado: `...${String(alvo.phone).slice(-6)}` },
      mensagemTestada: msg,
      httpStatus,
      respostaDoAtendimento: resposta,
    })
  }

  /* ?dump=<fragmento telefone> → últimas 15 mensagens do contato
     (direção, status, trecho) pra ver se a resposta foi gravada e se
     'enviada' realmente saiu (status) ou ficou presa. */
  const dump = request.nextUrl.searchParams.get('dump')?.replace(/\D/g, '')
  if (dump) {
    const admin = createClient(url, key)
    const { data: c } = await admin
      .from('whatsapp_contatos').select('id, phone, nome')
      .eq('user_id', uid).ilike('phone', `%${dump.slice(-8)}%`).limit(1)
    const alvo = c?.[0]
    if (!alvo) return NextResponse.json({ ok: false, motivo: 'contato não encontrado' })
    const { data: msgs } = await admin
      .from('whatsapp_mensagens')
      .select('direcao, conteudo, status, message_id, timestamp, raw')
      .eq('contato_id', alvo.id)
      .order('timestamp', { ascending: false })
      .limit(15)
    return NextResponse.json({
      ok: true,
      contato: { nome: alvo.nome, phone_mascarado: `...${String(alvo.phone).slice(-6)}` },
      mensagens: (msgs ?? []).map(m => ({
        dir: m.direcao,
        status: m.status,
        temMessageId: !!m.message_id,
        origem: (m.raw as { origem?: string } | null)?.origem ?? null,
        quando: m.timestamp,
        texto: String(m.conteudo ?? '').slice(0, 45),
      })),
    })
  }

  /* Config que decide se o atendimento responde */
  const { data: cfg } = await createClient(url, key)
    .from('loja_config')
    .select('ativo, proativo_ativo, horario, endereco, meta_phone_number_id, meta_waba_id')
    .eq('user_id', uid).maybeSingle()

  const diag = {
    ok: true,
    env,
    loja: {
      nomeLoja: loja.nomeLoja,
      provider: loja.creds.provider,
      temMetaPhoneNumberId: !!loja.creds.meta?.phoneNumberId,
      temMetaAccessToken: !!loja.creds.meta?.accessToken,
      temZapiToken: !!loja.creds.token,
      ownerPhoneUltimos4: loja.ownerPhone ? loja.ownerPhone.slice(-4) : null,
    },
    atendimento: {
      ativo: cfg?.ativo,                         // se false → IA fica calada
      atendimentoAtivo: loja.atendimentoAtivo,
      temHorario: !!cfg?.horario,
      metaPhoneNumberId: cfg?.meta_phone_number_id ?? null,
      metaWabaId: cfg?.meta_waba_id ?? null,
    },
  }

  /* ?enviar=1 → dispara um envio REAL pelo mesmo caminho dos handlers
     (sem creds, igual owner/comando faz) e devolve o erro cru da Meta.
     Só envia pro ownerPhone da própria loja — não dá pra usar pra spam. */
  if (request.nextUrl.searchParams.get('enviar') === '1') {
    if (!loja.ownerPhone) {
      return NextResponse.json({ ...diag, envio: { ok: false, motivo: 'loja sem owner_phone' } })
    }
    try {
      const r = await sendWhatsAppMessage({
        phone: loja.ownerPhone,
        message: '🔧 Teste de diagnóstico do Zivo — se você recebeu isto, o envio pela Meta está funcionando.',
      })
      return NextResponse.json({ ...diag, envio: { ok: true, messageId: r.messageId ?? null } })
    } catch (e) {
      return NextResponse.json({ ...diag, envio: { ok: false, erro: e instanceof Error ? e.message : String(e) } })
    }
  }

  return NextResponse.json(diag)
}
