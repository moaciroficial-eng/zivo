import { after } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { varrerConversasPendentes } from '@/lib/agentes/varredura'

/* ══════════════════════════════════════════════════════════════
   PIPELINE DE MENSAGEM RECEBIDA — compartilhado entre provedores

   Recebe o payload já NORMALIZADO no formato "raiz da Z-API"
   (phone, fromMe, isGroup, type=ReceivedCallback/…, messageId,
   senderName, momment, e o conteúdo em text/image/audio/…). A rota
   da Meta traduz o formato dela pra este shape antes de chamar aqui,
   então toda a lógica de matching/dono/tarefa/atendimento é única.
   ══════════════════════════════════════════════════════════════ */

function extractConteudo(body: Record<string, unknown>): { conteudo: string | null; tipo: string } {
  if (body.text)     return { conteudo: (body.text as Record<string,unknown>).message as string ?? null, tipo: 'texto' }
  if (body.image)    return { conteudo: (body.image as Record<string,unknown>).caption as string ?? '📷 Imagem', tipo: 'imagem' }
  if (body.video)    return { conteudo: (body.video as Record<string,unknown>).caption as string ?? '🎥 Vídeo', tipo: 'video' }
  if (body.audio)    return { conteudo: '🎵 Áudio', tipo: 'audio' }
  if (body.document) return { conteudo: (body.document as Record<string,unknown>).fileName as string ?? '📄 Documento', tipo: 'documento' }
  if (body.sticker)  return { conteudo: '🎯 Sticker', tipo: 'sticker' }
  if (body.location) return { conteudo: `📍 ${(body.location as Record<string,unknown>).name ?? 'Localização'}`, tipo: 'localizacao' }
  if (body.contact)  return { conteudo: '👤 Contato', tipo: 'contato' }
  return { conteudo: null, tipo: 'desconhecido' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processarEventoInbound(supabase: any, userId: string, payload: Record<string, unknown>): Promise<void> {
  /* Normaliza phone: sempre com código do país 55 e com o 9 do celular brasileiro */
  const rawPhone = typeof payload.phone === 'string' ? payload.phone.replace(/\D/g, '') : null
  const phoneWith55 = rawPhone ? (rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`) : null
  /* Adiciona o 9 se for celular BR sem ele: 55 + 2 DDD + 8 dígitos começando em 6-9 = 12 dígitos */
  const phone = phoneWith55 && phoneWith55.length === 12 && /^55\d{2}[6-9]/.test(phoneWith55)
    ? `${phoneWith55.slice(0, 4)}9${phoneWith55.slice(4)}`
    : phoneWith55
  const fromMe   = Boolean(payload.fromMe)
  const isGroup  = Boolean(payload.isGroup)
  const msgType  = payload.type as string | undefined

  /* Ignora grupos, broadcasts e pings sem telefone */
  if (!phone || isGroup) return

  /* Status updates (delivery/read) */
  if (msgType === 'DeliveryCallback' || msgType === 'ReadCallback' || msgType === 'MessageStatusCallback') {
    const msgId  = payload.messageId as string | undefined
    const status = msgType === 'ReadCallback' ? 'lida' : 'entregue'
    if (msgId) {
      await supabase.from('whatsapp_mensagens').update({ status }).eq('message_id', msgId)
    }
    return
  }

  /* Mensagens recebidas e enviadas */
  if (msgType !== 'ReceivedCallback' && msgType !== 'SentCallback') return

  const messageId  = payload.messageId as string | undefined
  const senderName = payload.senderName as string | null | undefined
  const momment    = payload.momment as number | undefined
  const timestamp  = new Date(momment ?? Date.now()).toISOString()
  const direcao    = fromMe ? 'enviada' : 'recebida'
  const { conteudo, tipo } = extractConteudo(payload)
  const creds = (payload.__creds as import('@/lib/whatsapp').WhatsAppCreds | undefined)

  /* Deduplicação: ignora se messageId já foi processado */
  if (messageId) {
    const { data: jaExiste } = await supabase
      .from('whatsapp_mensagens')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle()
    if (jaExiste) {
      console.log(`[inbound] Mensagem duplicada ignorada: ${messageId}`)
      return
    }
  }

  /* Detecção do dono ANTES de qualquer processamento
     Fontes: env var + loja_config (DB) para garantir que funciona */
  const baseUrl       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
  const cleanUserId   = (userId ?? '').replace(/^﻿/, '').trim()
  const envOwnerPhone = (process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
  const { data: cfg } = await supabase.from('loja_config').select('owner_phone').eq('user_id', cleanUserId).maybeSingle()
  const dbOwnerPhone  = (cfg?.owner_phone ?? '').replace(/\D/g, '')
  const ownerPhone    = dbOwnerPhone || envOwnerPhone

  const phoneLimpo    = phone.replace(/\D/g, '')
  const isOwner       = !!ownerPhone && (
    phoneLimpo.slice(-11) === ownerPhone.slice(-11) ||
    phoneLimpo.slice(-10) === ownerPhone.slice(-10) ||
    phoneLimpo.slice(-8)  === ownerPhone.slice(-8)
  )

  console.log(`[inbound] phone=${phoneLimpo} ownerPhone=${ownerPhone} dbOwner=${dbOwnerPhone} envOwner=${envOwnerPhone} isOwner=${isOwner}`)

  /* Se for o dono mensangendo a loja: rota para comandos ou escalação, nunca atendimento */
  if (direcao === 'recebida' && isOwner && conteudo) {
    console.log(`[inbound] Dono detectado: ${phone}`)

    /* Salva a mensagem do dono no histórico */
    const { data: contatoDono } = await supabase
      .from('whatsapp_contatos')
      .upsert({ user_id: cleanUserId, phone, nome: 'Moca (você)', ultima_mensagem: conteudo, ultima_mensagem_at: timestamp },
        { onConflict: 'user_id,phone', ignoreDuplicates: false })
      .select('id').single()
    if (contatoDono?.id && messageId) {
      await supabase.from('whatsapp_mensagens').upsert({
        user_id: cleanUserId, contato_id: contatoDono.id,
        message_id: messageId, direcao: 'recebida', tipo, conteudo,
        status: 'recebida', timestamp, raw: payload,
      }, { onConflict: 'message_id', ignoreDuplicates: true })
    }

    const { data: escalacoes } = await supabase
      .from('atendimento_escalacoes')
      .select('id, contato_id')
      .eq('user_id', cleanUserId)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(1)
    const escal = escalacoes?.[0] ?? null
    if (escal) {
      await supabase.from('atendimento_escalacoes').update({
        status: 'respondida', resposta_owner: conteudo, updated_at: new Date().toISOString(),
      }).eq('id', escal.id)
      after(fetch(`${baseUrl}/api/agentes/atendimento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
        body: JSON.stringify({ contatoId: escal.contato_id, userId: cleanUserId, mensagem: conteudo, instrucaoOwner: conteudo }),
      }).catch(() => null))
    } else {
      if (conteudo && conteudo.trim().length > 3) {
        sendWhatsAppMessage({ phone: ownerPhone, message: '⏳', creds }).catch(() => null)
      }
      after(fetch(`${baseUrl}/api/owner/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
        body: JSON.stringify({ userId: cleanUserId, mensagem: conteudo, ownerPhone }),
      }).catch(() => null))
    }
    return
  }

  /* Matching automático com cliente pelo telefone */
  let clienteId: string | null = null
  const phoneLast = phone.slice(-8)
  const { data: clienteMatch } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('user_id', cleanUserId)
    .filter('telefone', 'ilike', `%${phoneLast}`)
    .maybeSingle()
  if (clienteMatch) clienteId = clienteMatch.id

  const funilEtapa = clienteId ? 'fundo' : 'topo'
  const nomeContato = senderName ?? clienteMatch?.nome ?? phone

  /* Verifica se vem de link de campanha */
  let campanhaId: string | null = null
  if (!fromMe && conteudo) {
    const { data: camp } = await supabase
      .from('campanhas')
      .select('id')
      .eq('user_id', cleanUserId)
      .filter('link_rastreamento', 'ilike', `%${conteudo.slice(0, 30)}%`)
      .maybeSingle()
    if (camp) campanhaId = camp.id
  }

  /* Upsert contato */
  const upsertData: Record<string, unknown> = {
    user_id: cleanUserId,
    phone,
    nome: nomeContato,
    ultima_mensagem: conteudo ?? tipo,
    ultima_mensagem_at: timestamp,
    cliente_id: clienteId,
    funil_etapa: funilEtapa,
  }
  if (campanhaId) upsertData.campanha_id = campanhaId

  const { data: contato, error: contatoErr } = await supabase
    .from('whatsapp_contatos')
    .upsert(upsertData, { onConflict: 'user_id,phone', ignoreDuplicates: false })
    .select('id, nao_lidas, foto_url')
    .single()

  if (contatoErr || !contato) {
    console.error('Erro upsert contato:', contatoErr)
    return
  }

  /* Busca foto de perfil se o contato for novo (sem foto) — só Z-API */
  const zapiInstance = process.env.ZAPI_INSTANCE_ID
  const zapiToken    = process.env.ZAPI_TOKEN
  const contatoAtual = contato as { id: string; nao_lidas: number; foto_url?: string | null }
  if (!contatoAtual.foto_url && !fromMe && (creds?.provider ?? 'zapi') !== 'meta' && zapiInstance && zapiToken) {
    try {
      const number = phone.startsWith('55') ? phone : `55${phone}`
      const fotoRes = await fetch(
        `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/profile-picture?phone=${number}`,
        { cache: 'no-store', headers: { 'Client-Token': (process.env.ZAPI_CLIENT_TOKEN ?? zapiToken).replace(/^﻿/, '').trim() } }
      )
      if (fotoRes.ok) {
        const fotoData = await fotoRes.json()
        const fotoUrl = fotoData?.link ?? fotoData?.photo ?? fotoData?.url ?? null
        if (fotoUrl) {
          await supabase.from('whatsapp_contatos').update({ foto_url: fotoUrl }).eq('id', contato.id)
        }
      }
    } catch { /* silencioso */ }
  }

  /* Incrementa não lidas */
  if (direcao === 'recebida') {
    await supabase
      .from('whatsapp_contatos')
      .update({ nao_lidas: ((contato.nao_lidas as number) ?? 0) + 1 })
      .eq('id', contato.id)
  }

  /* Insere mensagem */
  await supabase.from('whatsapp_mensagens').upsert(
    {
      user_id:    cleanUserId,
      contato_id: contato.id,
      message_id: messageId,
      direcao,
      tipo,
      conteudo,
      status: fromMe ? 'enviada' : 'recebida',
      timestamp,
      raw: payload,
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  )

  /* Se for lead de campanha, registra em campanha_leads */
  if (campanhaId && !fromMe) {
    await supabase.from('campanha_leads').upsert(
      {
        user_id: cleanUserId,
        campanha_id: campanhaId,
        contato_id: contato.id,
        cliente_id: clienteId,
        phone,
        nome: nomeContato,
        status: 'novo',
      },
      { onConflict: 'campanha_id,phone' as never, ignoreDuplicates: true },
    )
  }

  if (direcao === 'recebida') {

    /* Vigia: reprocessa conversas de tarefa que ficaram pendentes
       (rede de segurança — se algum disparo falhou, se cura aqui) */
    after(varrerConversasPendentes(supabase, cleanUserId).catch(() => null))

    /* Dispara agente proativo uma vez por dia (primeira mensagem do dia) */
    const { data: cfgProativo } = await supabase
      .from('loja_config').select('proativo_ultimo_run').eq('user_id', cleanUserId).maybeSingle()
    if (cfgProativo) {
      const ultimoRun = cfgProativo.proativo_ultimo_run ? new Date(cfgProativo.proativo_ultimo_run) : null
      const hoje = new Date()
      const jaRodouHoje = ultimoRun &&
        ultimoRun.getFullYear() === hoje.getFullYear() &&
        ultimoRun.getMonth()    === hoje.getMonth()    &&
        ultimoRun.getDate()     === hoje.getDate()
      if (!jaRodouHoje) {
        after(fetch(`${baseUrl}/api/agentes/proativo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: cleanUserId, ownerPhone }),
        }).catch(() => null))
      }
    }

    /* Verifica se há conversa automatizada ativa e recente (menos de 48h) para este contato */
    const limiteEstado = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: estadosAtivos } = await supabase
      .from('agente_conversa_estado')
      .select('id, tarefa_id, updated_at')
      .eq('contato_id', contato.id)
      /* inclui 'processando': se o cliente responde enquanto o agente ainda
         está gerando a mensagem anterior, a resposta cai na trava/agregação
         do executor em vez de vazar pro atendimento normal */
      .in('status', ['iniciando', 'aguardando', 'processando'])
      .gte('updated_at', limiteEstado)
      .order('updated_at', { ascending: false })
      .limit(1)
    const estadoAtivo = estadosAtivos?.[0] ?? null

    if (tipo === 'audio' || tipo === 'ptt') {
      /* Áudio: responde imediatamente pedindo para digitar */
      const nomeCliente = senderName?.split(' ')[0] ?? 'você'
      sendWhatsAppMessage({
        phone,
        message: `Oi ${nomeCliente}! 😊 Por enquanto não consigo ouvir áudios. Pode escrever sua mensagem por texto? Vai ser mais rápido pra te responder! 🙏`,
        creds,
      }).catch(() => null)
    } else if (tipo === 'texto' && conteudo) {
      if (estadoAtivo) {
        /* Tarefa ativa: chama gerente/executar diretamente para evitar cadeia fire-and-forget */
        after(fetch(`${baseUrl}/api/gerente/executar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
          body: JSON.stringify({
            userId:          cleanUserId,
            tarefaId:        estadoAtivo.tarefa_id,
            contatoId:       contato.id,
            respostaContato: conteudo,
          }),
        }).catch(() => null))
      } else {
        /* Atendimento normal: debounce de 3s para agrupar mensagens em sequência */
        after(fetch(`${baseUrl}/api/agentes/dados`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
          body: JSON.stringify({ contatoId: contato.id, userId: cleanUserId }),
        }).catch(() => null))

        after(fetch(`${baseUrl}/api/agentes/processar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
          body: JSON.stringify({ contatoId: contato.id, userId: cleanUserId, timestamp }),
        }).catch(() => null))
      }
    }
  }
}
