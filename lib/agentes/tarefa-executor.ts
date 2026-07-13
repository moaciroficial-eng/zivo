import { after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage, donoAssumiuConversa } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/* Valor utilizável: existe, não é vazio e não é recusa */
const util = (v: unknown) => v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'recusado'
/* Preenchido para fins de conclusão: recusa também conta como "resolvido" */
const preenchido = (v: unknown) => v != null && String(v).trim() !== ''

/* Pergunta padrão do campo faltante — usada quando o modelo tenta concluir
   sem ter tudo (checklist rejeita e força a pergunta certa) */
function perguntaCampo(campo: string, isFem: boolean): string {
  switch (campo) {
    case 'nome':             return 'Só me confirma: qual é seu nome completo?'
    case 'data_nascimento':  return 'E qual é sua data de nascimento? (formato DD/MM/AAAA)'
    case 'tamanho_camiseta': return isFem ? 'E qual é seu tamanho de blusa? (P, M, G, GG ou XGG)' : 'E qual é seu tamanho de camiseta? (P, M, G, GG ou XGG)'
    case 'tamanho_calca':    return isFem ? 'E qual é sua numeração de calça? (34, 36, 38, 40, 42, 44 ou 46)' : 'E qual é sua numeração de calça? (38 ao 50)'
    case 'tamanho_tenis':    return 'E qual é seu número de tênis? (37 ao 44)'
    default:                 return 'Só falta um detalhe pra fechar seu cadastro 😊'
  }
}

type HistoricoItem = { papel: string; texto: string }

interface Contato {
  id: string
  nome: string | null
  phone: string
  cliente_id: string | null
  genero?: string | null
}

interface Estado {
  id: string
  tarefa_id: string
  status: string
  historico: HistoricoItem[]
  dados_coletados: Record<string, unknown>
}

interface Tarefa {
  id: string
  instrucao: string
  concluidos: number
  total: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processarRespostaTarefa(
  admin: any,
  userId: string,
  tarefa: Tarefa,
  estado: Estado,
  contato: Contato,
  respostaContato: string | null
): Promise<{ respondeu: boolean; concluido: boolean }> {
  const nomeContato = contato.nome?.split(' ')[0] ?? 'você'
  const historico: HistoricoItem[] = Array.isArray(estado.historico) ? [...estado.historico] : []
  /* Normaliza: aceita 'F', 'f', 'Feminino'... Se não tem no cadastro, a IA deduz pelo nome */
  const generoNorm = (contato.genero ?? '').trim().toUpperCase().charAt(0)
  const isFem = generoNorm === 'F'
  const generoConhecido = generoNorm === 'F' || generoNorm === 'M'

  if (respostaContato) {
    historico.push({ papel: 'contato', texto: respostaContato })
  }

  /* Campos internos (prefixo _) não vão pro prompt */
  const dadosVisiveis = Object.fromEntries(
    Object.entries(estado.dados_coletados ?? {}).filter(([k]) => !k.startsWith('_'))
  )

  /* Dados vindos do cadastro da loja: podem estar errados/desatualizados,
     então só valem depois que o contato confirmar. O que já foi
     confirmado/coletado (está em dadosVisiveis) sai da lista. */
  const doCadastro = (estado.dados_coletados?._do_cadastro ?? {}) as Record<string, unknown>
  const aConfirmar = Object.fromEntries(
    Object.entries(doCadastro).filter(([k, v]) => v != null && dadosVisiveis[k] == null)
  )
  const temAConfirmar = Object.keys(aConfirmar).length > 0

  const regrasFem = `- Ordem sugerida: nome → data de nascimento → tamanho de blusa (P/M/G/GG/XGG) → tamanho de calça (34 ao 46)
- Pergunte "tamanho de blusa", NUNCA "tamanho de camiseta" (mas salve a resposta no campo tamanho_camiseta)
- NÃO pergunte número de tênis para clientes femininas
- SÓ marque concluido: true quando tiver: nome, data_nascimento, tamanho_camiseta (blusa), tamanho_calca — OU quando recusar responder algum`

  const regrasMasc = `- Ordem sugerida: nome → data de nascimento → tamanho de camiseta → tamanho de calça (38 ao 50) → número de tênis
- SÓ marque concluido: true quando tiver coletado TODOS: nome, data_nascimento, tamanho_camiseta, tamanho_calca, tamanho_tenis — OU quando recusar responder algum`

  const regrasGenero = isFem
    ? regrasFem
    : generoConhecido
      ? regrasMasc
      : `- O gênero NÃO está no cadastro: deduza pelo nome do contato e preencha salvar_no_cliente.genero com "M" ou "F"
- Se o nome for FEMININO (ex: Camila, Ana, Maria...):
${regrasFem}
- Se o nome for MASCULINO:
${regrasMasc}`

  const res = await anthropic.messages.create({
    /* Haiku (3x mais barato): os deslizes que ele tinha agora são
       barrados em código — checklist de conclusão rejeita "concluído"
       com campo faltando, e o guard de data bloqueia data alucinada.
       Roda por turno × por cliente em campanhas: aqui o barato compensa. */
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Você é um agente executando uma tarefa via WhatsApp para uma loja de roupas.

TAREFA: ${tarefa.instrucao}

CONTATO: ${contato.nome ?? contato.phone}${generoConhecido ? (isFem ? ' (GÊNERO: FEMININO)' : ' (GÊNERO: MASCULINO)') : ' (gênero não cadastrado — deduza pelo nome)'}
DADOS JÁ CONFIRMADOS/COLETADOS: ${JSON.stringify(dadosVisiveis)}${temAConfirmar ? `
DADOS DO CADASTRO AINDA NÃO CONFIRMADOS (podem estar errados — confirme com o contato antes de dar como certos): ${JSON.stringify(aConfirmar)}` : ''}

HISTÓRICO:
${historico.map(h => `[${h.papel.toUpperCase()}] ${h.texto}`).join('\n') || '(início da conversa)'}

Decida o próximo passo. JSON EXATO (use EXATAMENTE esses nomes de campo):
{
  "proxima_mensagem": "mensagem para o contato — ao concluir, envie um agradecimento curto de encerramento (nunca null quando o contato acabou de responder o último dado)",
  "dados_novos": {
    "tamanho_camiseta": "${isFem ? 'P/M/G/GG/XGG (blusa) se coletou' : 'P/M/G/GG/XGG se coletou'} (null se não coletou NESTA resposta)",
    "tamanho_calca": "numeração se coletou (null se não coletou NESTA resposta)",
    "tamanho_tenis": "numeração se coletou (null se não coletou NESTA resposta)"
  },
  "concluido": false,
  "salvar_no_cliente": {
    "nome": "nome completo se coletou (null se não coletou NESTA resposta)",
    "data_nascimento": "DD/MM/AAAA se coletou (null se não coletou NESTA resposta)",
    "genero": ${generoConhecido ? 'null' : '"M ou F deduzido pelo nome do contato (null se incerto)"'}
  }
}

REGRAS:
- Use "${nomeContato}" para personalizar
- NUNCA pergunte algo que já está em DADOS JÁ CONFIRMADOS/COLETADOS — pergunte APENAS o que falta
- NOME: SEMPRE pergunte o nome completo de forma aberta ("qual é seu nome completo?"). NUNCA peça só pra confirmar o nome — o cadastro pode estar errado ou ser um apelido.
- REGRA DE OURO: UMA pergunta por mensagem. NUNCA junte duas perguntas, e NUNCA junte a confirmação de um dado com uma pergunta nova na mesma mensagem.
${temAConfirmar ? `- Há dados do cadastro a CONFIRMAR (nascimento/tamanhos). Confirme-os em UMA mensagem separada, só a confirmação, sem emendar outra pergunta. Exemplo: "No cadastro você está com nascimento 22/01/1997 e blusa M. Tá certinho ou mudou algo?"
- Quando o contato CONFIRMAR, copie os valores confirmados para dados_novos/salvar_no_cliente NESTA resposta; quando ele CORRIGIR algum, use o valor corrigido
- Dados não confirmados NÃO contam como coletados — não conclua sem confirmar` : ''}
- Se não falta nada e nada há a confirmar: envie uma única mensagem simpática dizendo que o cadastro está em dia e marque concluido: true
- Primeira mensagem (histórico vazio): apresente-se como Moca e faça UMA coisa só — se falta o nome, pergunte o nome; senão, ${temAConfirmar ? 'confirme os dados do cadastro (só a confirmação).' : 'pergunte o primeiro dado que FALTA.'} Exemplo de abertura: "Oi ${nomeContato}! Aqui é o Moca 😊 Estou atualizando o cadastro dos meus clientes pra atender vocês cada vez melhor. Tudo bem te fazer umas perguntinhas rápidas? Pra começar, qual é seu nome completo?"
- Histórico com mensagens anteriores: NÃO se reapresente, continue naturalmente
- O contato pode responder mais de um dado numa mensagem só — capture todos
${regrasGenero}
- Se o contato disser que não usa ou não quer informar um campo (calça, tênis...), preencha esse campo com "recusado" em dados_novos e siga pro próximo
- Ao coletar o ÚLTIMO dado: marque concluido: true E envie proxima_mensagem agradecendo e encerrando, SEMPRE com o primeiro nome do contato (nunca só emoji). Exemplo: "Perfeito, ${nomeContato}! Anotei tudo aqui, cadastro atualizado ✅ Obrigado pela atenção! Qualquer coisa é só chamar 😊"
- Depois de concluído (histórico já tem o agradecimento final), se o contato mandar mais alguma mensagem: responda educadamente sem fazer novas perguntas
- Nos campos "dados_novos" e "salvar_no_cliente": inclua APENAS o que foi coletado NESTA resposta, null nos demais`,
    }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let acao = null
  try { acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null } catch { acao = null }

  if (!acao) {
    /* Libera a trava para a conversa não ficar presa em 'processando' */
    await admin.from('agente_conversa_estado')
      .update({ status: 'aguardando', updated_at: new Date().toISOString() })
      .eq('id', estado.id)
    return { respondeu: false, concluido: false }
  }

  /* ── Merge do turno (ANTES do envio, pra validar a conclusão) ── */
  const dadosNovosLimpos = Object.fromEntries(
    Object.entries(acao.dados_novos ?? {}).filter(([, v]) => v != null)
  )
  const salvarLimpo = Object.fromEntries(
    Object.entries(acao.salvar_no_cliente ?? {}).filter(([, v]) => v != null)
  )

  /* Guard anti-alucinação de DATA: o modelo às vezes "re-copia" a data com
     dia/mês trocado e corrompe o cadastro. Data só é aceita se:
     (a) o contato escreveu uma data NESTE turno, ou
     (b) é cópia exata do cadastro (confirmação), ou
     (c) é igual à que já estava coletada. */
  const dataJaColetada = (estado.dados_coletados ?? {}).data_nascimento as string | undefined
  const dataDoCadastro = doCadastro.data_nascimento as string | undefined
  const contatoEscreveuData = !!respostaContato && /\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?/.test(respostaContato)
  for (const bag of [dadosNovosLimpos, salvarLimpo] as Record<string, unknown>[]) {
    const d = bag.data_nascimento as string | undefined
    if (d && !contatoEscreveuData && d !== dataDoCadastro && d !== dataJaColetada) {
      delete bag.data_nascimento
    }
  }

  const dadosAtualizados: Record<string, unknown> = {
    ...(estado.dados_coletados ?? {}),
    ...dadosNovosLimpos,
    ...salvarLimpo,
  }

  /* ── Checklist determinístico: o modelo NÃO decide sozinho que acabou.
     Faltando campo obrigatório (sem recusa registrada), a conclusão é
     rejeitada e a pergunta do campo faltante é enviada. ── */
  const camposObrigatorios = isFem
    ? ['nome', 'data_nascimento', 'tamanho_camiseta', 'tamanho_calca']
    : ['nome', 'data_nascimento', 'tamanho_camiseta', 'tamanho_calca', 'tamanho_tenis']
  const faltantes = camposObrigatorios.filter(c => !preenchido(dadosAtualizados[c]))

  if (acao.concluido && faltantes.length > 0) {
    acao.concluido = false
    const proxima = String(acao.proxima_mensagem ?? '')
    const pareceEncerramento = !proxima ||
      /anotei tudo|cadastro atualizado|tudo certinho no meu cadastro|obrigado pela atenção|qualquer coisa é só chamar/i.test(proxima)
    if (pareceEncerramento) {
      acao.proxima_mensagem = perguntaCampo(faltantes[0], isFem)
    }
  }

  /* Envia resposta ao cliente */
  if (acao.proxima_mensagem) {
    const { messageId } = await sendWhatsAppMessage({ phone: contato.phone, message: acao.proxima_mensagem })
    historico.push({ papel: 'agente', texto: acao.proxima_mensagem })

    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contato.id,
      message_id: messageId ?? null,
      direcao: 'enviada', tipo: 'texto',
      conteudo: acao.proxima_mensagem, status: 'enviada', timestamp,
      raw: { origem: 'ia' },
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: acao.proxima_mensagem,
      ultima_mensagem_at: timestamp,
    }).eq('id', contato.id)
  }

  /* Resolve cliente_id (fallback: busca por telefone) */
  let clienteAlvoId = contato.cliente_id
  if (!clienteAlvoId && contato.phone) {
    const phoneLast = contato.phone.replace(/\D/g, '').slice(-8)
    const { data: clienteMatch } = await admin
      .from('clientes').select('id').eq('user_id', userId)
      .ilike('telefone', `%${phoneLast}`).maybeSingle()
    if (clienteMatch) {
      clienteAlvoId = clienteMatch.id
      await admin.from('whatsapp_contatos').update({ cliente_id: clienteAlvoId }).eq('id', contato.id)
    }
  }

  /* Atualiza cadastro do cliente — sempre a partir dos dados PÓS-GUARD
     (dadosAtualizados na conclusão; só o coletado neste turno no meio).
     Valores "recusado" nunca vão pro cadastro. */
  if (clienteAlvoId) {
    const fontes = acao.concluido ? [dadosAtualizados] : [salvarLimpo, dadosNovosLimpos]

    const update: Record<string, string> = {}
    for (const fonte of fontes as Record<string, unknown>[]) {
      if (util(fonte.nome) && !update.nome) update.nome = String(fonte.nome)
      if (util(fonte.data_nascimento) && !update.data_nascimento) {
        const partes = String(fonte.data_nascimento).split('/')
        if (partes.length === 3) update.data_nascimento = `${partes[2]}-${partes[1]}-${partes[0]}`
      }
      if (util(fonte.telefone) && !update.telefone) update.telefone = String(fonte.telefone)
      /* Gênero deduzido pelo nome (só quando não estava no cadastro) */
      if (!generoConhecido && (fonte.genero === 'M' || fonte.genero === 'F') && !update.genero) {
        update.genero = String(fonte.genero)
      }
      const camposCamiseta = ['tamanho_camiseta', 'tamanho', 'camiseta', 'tam_camiseta', 'tamanho_roupa']
      const camposCalca = ['tamanho_calca', 'numeracao_calca', 'calca', 'numeracao', 'tam_calca']
      const camposTenis = ['tamanho_tenis', 'numero_tenis', 'tenis', 'numeracao_tenis', 'tam_tenis']
      const tc = camposCamiseta.map(c => fonte[c]).find(v => util(v))
      const tca = camposCalca.map(c => fonte[c]).find(v => util(v))
      const tte = camposTenis.map(c => fonte[c]).find(v => util(v))
      if (tc && !update.tamanho_camiseta) update.tamanho_camiseta = String(tc)
      if (tca && !update.tamanho_calca) update.tamanho_calca = String(tca)
      if (tte && !update.tamanho_tenis) update.tamanho_tenis = String(tte)
    }
    if (Object.keys(update).length > 0) {
      await admin.from('clientes').update(update).eq('id', clienteAlvoId)
    }
  }

  /* Salva tamanhos nos insights (recusas não entram) */
  const tamCamiseta = ['tamanho_camiseta', 'tamanho', 'camiseta'].map(c => dadosAtualizados[c]).find(v => util(v))
  const tamCalca = ['tamanho_calca', 'numeracao_calca', 'calca'].map(c => dadosAtualizados[c]).find(v => util(v))
  const tamTenis = ['tamanho_tenis', 'numero_tenis', 'tenis'].map(c => dadosAtualizados[c]).find(v => util(v))

  if (tamCamiseta || tamCalca || tamTenis) {
    const tamanhos: string[] = []
    if (tamCamiseta) tamanhos.push(`Camiseta: ${tamCamiseta}`)
    if (tamCalca) tamanhos.push(`Calça: ${tamCalca}`)
    if (tamTenis) tamanhos.push(`Tênis: ${tamTenis}`)
    await admin.from('contato_insights').upsert({
      user_id: userId, contato_id: contato.id,
      cliente_id: clienteAlvoId ?? contato.cliente_id ?? null,
      tamanhos, ultima_analise: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'contato_id' })
  }

  const novoStatus = acao.concluido ? 'concluido' : 'aguardando'

  await admin.from('agente_conversa_estado').update({
    status: novoStatus,
    historico,
    dados_coletados: dadosAtualizados,
    updated_at: new Date().toISOString(),
  }).eq('id', estado.id)

  /* Ao concluir, limpa todos os estados pendentes desse contato para evitar loop */
  if (acao.concluido) {
    await admin.from('agente_conversa_estado')
      .update({ status: 'concluido', updated_at: new Date().toISOString() })
      .eq('contato_id', contato.id)
      .in('status', ['aguardando', 'iniciando'])
  }

  if (acao.concluido) {
    const novoConcluidos = (tarefa.concluidos ?? 0) + 1
    await admin.from('agente_tarefas').update({
      concluidos: novoConcluidos,
      status: novoConcluidos >= (tarefa.total ?? 1) ? 'concluida' : 'ativa',
    }).eq('id', tarefa.id)
  }

  return { respondeu: !!acao.proxima_mensagem, concluido: !!acao.concluido }
}

/* ══════════════════════════════════════════════════════════════
   ORQUESTRADOR DE TURNO — único ponto de entrada do fluxo de tarefa.

   Garante que cada resposta do cliente seja processada UMA vez:
   1. Trava atômica no estado (aguardando/iniciando → processando)
   2. Debounce + agregação: junta TODAS as mensagens ainda não
      processadas (marcador _ultima_msg_ts em dados_coletados)
   3. Libera a trava em qualquer caminho de erro
   4. Rouba trava presa há mais de 2 minutos (processo que morreu)
   5. Encadeia o próximo contato pendente após o primeiro envio
   ══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executarTurnoTarefa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  tarefaId: string,
  contatoId: string,
): Promise<{ ok: boolean; skipped?: string; respondeu?: boolean; concluido?: boolean }> {
  /* ── 1. Estado mais recente dessa tarefa+contato ── */
  const { data: estados } = await admin
    .from('agente_conversa_estado')
    .select('id, status, created_at')
    .eq('tarefa_id', tarefaId)
    .eq('contato_id', contatoId)
    .order('updated_at', { ascending: false })
    .limit(1)
  const estadoRef = estados?.[0] as { id: string; status: string; created_at: string } | undefined
  if (!estadoRef) return { ok: false, skipped: 'estado não encontrado' }
  if (['concluido', 'cancelado', 'erro'].includes(estadoRef.status)) {
    return { ok: true, skipped: `já ${estadoRef.status}` }
  }

  /* ── 2. Trava atômica (com retry e roubo de trava presa) ── */
  const tentarTravar = async () => {
    const { data } = await admin
      .from('agente_conversa_estado')
      .update({ status: 'processando', updated_at: new Date().toISOString() })
      .eq('id', estadoRef.id)
      .in('status', ['iniciando', 'aguardando'])
      .select('id, historico, dados_coletados, created_at')
    return (data?.[0] ?? null) as { id: string; historico: HistoricoItem[]; dados_coletados: Record<string, unknown>; created_at: string } | null
  }
  const roubarTravaPresa = async () => {
    const cutoff = new Date(Date.now() - 120_000).toISOString()
    const { data } = await admin
      .from('agente_conversa_estado')
      .update({ status: 'processando', updated_at: new Date().toISOString() })
      .eq('id', estadoRef.id)
      .eq('status', 'processando')
      .lt('updated_at', cutoff)
      .select('id, historico, dados_coletados, created_at')
    return (data?.[0] ?? null) as Awaited<ReturnType<typeof tentarTravar>>
  }

  let estadoTravado = await tentarTravar()
  for (let i = 0; !estadoTravado && i < 3; i++) {
    estadoTravado = await roubarTravaPresa()
    if (estadoTravado) break
    await sleep(5000)
    estadoTravado = await tentarTravar()
  }
  if (!estadoTravado) {
    /* Outra execução está processando — a agregação dela (ou o próximo turno) cobre esta mensagem */
    return { ok: true, skipped: 'travado por outra execução' }
  }

  const liberar = async () => {
    await admin.from('agente_conversa_estado')
      .update({ status: 'aguardando', updated_at: new Date().toISOString() })
      .eq('id', estadoTravado!.id)
      .eq('status', 'processando')
  }

  try {
    /* Dono assumiu a conversa manualmente? IA não fala por cima.
       Devolve o status original (iniciando/aguardando) pra tarefa não se perder. */
    if (await donoAssumiuConversa(admin, contatoId)) {
      await admin.from('agente_conversa_estado')
        .update({ status: estadoRef.status, updated_at: new Date().toISOString() })
        .eq('id', estadoTravado.id)
        .eq('status', 'processando')
      return { ok: true, skipped: 'dono ativo na conversa — IA em silêncio' }
    }

    const historicoAtual: HistoricoItem[] = Array.isArray(estadoTravado.historico) ? estadoTravado.historico : []
    const dados = (estadoTravado.dados_coletados ?? {}) as Record<string, unknown>
    const primeiroEnvio = historicoAtual.length === 0

    /* ── 3. Agrega mensagens ainda não processadas ── */
    let respostaContato: string | null = null
    if (!primeiroEnvio) {
      /* Debounce: dá tempo do cliente terminar de digitar mensagens em sequência */
      await sleep(3000)

      let desde = (dados._ultima_msg_ts as string) ?? null
      if (!desde) {
        const { data: ultEnviada } = await admin
          .from('whatsapp_mensagens')
          .select('timestamp')
          .eq('contato_id', contatoId)
          .eq('direcao', 'enviada')
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle()
        desde = ultEnviada?.timestamp ?? estadoTravado.created_at
      }

      const { data: novas } = await admin
        .from('whatsapp_mensagens')
        .select('conteudo, timestamp')
        .eq('contato_id', contatoId)
        .eq('direcao', 'recebida')
        .gt('timestamp', desde)
        .order('timestamp', { ascending: true })
        .limit(10)

      const lista = (novas ?? []) as { conteudo: string | null; timestamp: string }[]
      if (lista.length === 0) {
        /* Nada novo — outra execução já processou. Libera e sai. */
        await liberar()
        return { ok: true, skipped: 'sem mensagem nova' }
      }
      respostaContato = lista.map(m => m.conteudo).filter(Boolean).join('\n')
      dados._ultima_msg_ts = lista[lista.length - 1].timestamp
    }

    /* ── 4. Carrega tarefa e contato ── */
    const [{ data: tarefa }, { data: contato }] = await Promise.all([
      admin.from('agente_tarefas').select('id, instrucao, concluidos, total').eq('id', tarefaId).single(),
      admin.from('whatsapp_contatos').select('id, nome, phone, cliente_id, clientes(genero)').eq('id', contatoId).single(),
    ])
    if (!tarefa || !contato) {
      await liberar()
      return { ok: false, skipped: 'tarefa ou contato não encontrado' }
    }
    const generoCliente = (contato as { clientes?: { genero?: string | null } | null }).clientes?.genero ?? null

    /* ── 5. Processa o turno (processarRespostaTarefa grava o status final) ── */
    const resultado = await processarRespostaTarefa(
      admin, userId,
      { id: tarefa.id, instrucao: tarefa.instrucao, concluidos: tarefa.concluidos ?? 0, total: tarefa.total ?? 1 },
      { id: estadoTravado.id, tarefa_id: tarefaId, status: 'processando', historico: historicoAtual, dados_coletados: dados },
      { id: contatoId, nome: contato.nome, phone: contato.phone, cliente_id: contato.cliente_id ?? null, genero: generoCliente },
      respostaContato,
    )

    /* ── 6. Encadeia o próximo contato pendente da tarefa (após o 1º envio) ── */
    if (primeiroEnvio) {
      const { data: proximos } = await admin
        .from('agente_conversa_estado')
        .select('contato_id')
        .eq('tarefa_id', tarefaId)
        .eq('status', 'iniciando')
        .neq('contato_id', contatoId)
        .limit(1)
      const proximo = proximos?.[0] as { contato_id: string } | undefined
      if (proximo) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'
        after(fetch(`${baseUrl}/api/gerente/executar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET ?? ''}` },
          body: JSON.stringify({ userId, tarefaId, contatoId: proximo.contato_id }),
        }).catch(() => null))
      }
    }

    return { ok: true, ...resultado }
  } catch (e) {
    /* Nunca deixa a conversa presa em 'processando' */
    await liberar()
    return { ok: false, skipped: `erro: ${e instanceof Error ? e.message : 'desconhecido'}` }
  }
}
