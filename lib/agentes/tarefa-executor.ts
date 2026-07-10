import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Você é um agente executando uma tarefa via WhatsApp para uma loja de roupas.

TAREFA: ${tarefa.instrucao}

CONTATO: ${contato.nome ?? contato.phone}${generoConhecido ? (isFem ? ' (GÊNERO: FEMININO)' : ' (GÊNERO: MASCULINO)') : ' (gênero não cadastrado — deduza pelo nome)'}
DADOS JÁ COLETADOS: ${JSON.stringify(estado.dados_coletados)}

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
- Primeira mensagem (histórico vazio): apresente-se como Moca. Exemplo: "Oi ${nomeContato}! Aqui é o Moca 😊 Estou atualizando o cadastro dos meus clientes pra atender vocês cada vez melhor. Tudo bem te fazer umas perguntinhas rápidas? Pra começar, qual é seu nome completo?"
- Histórico com mensagens anteriores: NÃO se reapresente, continue naturalmente
- Faça UMA pergunta de cada vez
${regrasGenero}
- Se o contato disser que não usa calça ou tênis, aceite e continue para o próximo campo
- Ao coletar o ÚLTIMO dado: marque concluido: true E envie proxima_mensagem agradecendo e encerrando. Exemplo: "Perfeito, ${nomeContato}! Anotei tudo aqui, cadastro atualizado ✅ Obrigado pela atenção! Qualquer coisa é só chamar 😊"
- Depois de concluído (histórico já tem o agradecimento final), se o contato mandar mais alguma mensagem: responda educadamente sem fazer novas perguntas
- Nos campos "dados_novos" e "salvar_no_cliente": inclua APENAS o que foi coletado NESTA resposta, null nos demais`,
    }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null

  if (!acao) return { respondeu: false, concluido: false }

  /* Envia resposta ao cliente */
  if (acao.proxima_mensagem) {
    await sendWhatsAppMessage({ phone: contato.phone, message: acao.proxima_mensagem })
    historico.push({ papel: 'agente', texto: acao.proxima_mensagem })

    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id: userId, contato_id: contato.id,
      direcao: 'enviada', tipo: 'texto',
      conteudo: acao.proxima_mensagem, status: 'enviada', timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem: acao.proxima_mensagem,
      ultima_mensagem_at: timestamp,
    }).eq('id', contato.id)
  }

  /* Merge de dados coletados — filtra nulls para não sobrescrever dados já coletados */
  const dadosNovosLimpos = Object.fromEntries(
    Object.entries(acao.dados_novos ?? {}).filter(([, v]) => v != null)
  )
  const salvarLimpo = Object.fromEntries(
    Object.entries(acao.salvar_no_cliente ?? {}).filter(([, v]) => v != null)
  )
  const dadosAtualizados = {
    ...(estado.dados_coletados ?? {}),
    ...dadosNovosLimpos,
    ...salvarLimpo, // mantém no dados_coletados para a IA saber o que já foi coletado
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

  /* Atualiza cadastro do cliente */
  if (clienteAlvoId) {
    /* Usa dados do turno atual + dados acumulados quando concluído */
    const fontes = acao.concluido
      ? [acao.salvar_no_cliente ?? {}, dadosAtualizados]
      : [acao.salvar_no_cliente ?? {}]

    const update: Record<string, string> = {}
    for (const fonte of fontes) {
      if (fonte.nome && !update.nome) update.nome = String(fonte.nome)
      if (fonte.data_nascimento && !update.data_nascimento) {
        const partes = String(fonte.data_nascimento).split('/')
        if (partes.length === 3) update.data_nascimento = `${partes[2]}-${partes[1]}-${partes[0]}`
      }
      if (fonte.telefone && !update.telefone) update.telefone = String(fonte.telefone)
      /* Gênero deduzido pelo nome (só quando não estava no cadastro) */
      if (!generoConhecido && (fonte.genero === 'M' || fonte.genero === 'F') && !update.genero) {
        update.genero = String(fonte.genero)
      }
      const camposCamiseta = ['tamanho_camiseta', 'tamanho', 'camiseta', 'tam_camiseta', 'tamanho_roupa']
      const camposCalca = ['tamanho_calca', 'numeracao_calca', 'calca', 'numeracao', 'tam_calca']
      const camposTenis = ['tamanho_tenis', 'numero_tenis', 'tenis', 'numeracao_tenis', 'tam_tenis']
      const tc = camposCamiseta.map(c => (fonte as Record<string, unknown>)[c]).find(v => v != null)
      const tca = camposCalca.map(c => (fonte as Record<string, unknown>)[c]).find(v => v != null)
      const tte = camposTenis.map(c => (fonte as Record<string, unknown>)[c]).find(v => v != null)
      if (tc && !update.tamanho_camiseta) update.tamanho_camiseta = String(tc)
      if (tca && !update.tamanho_calca) update.tamanho_calca = String(tca)
      if (tte && !update.tamanho_tenis) update.tamanho_tenis = String(tte)
    }
    if (Object.keys(update).length > 0) {
      await admin.from('clientes').update(update).eq('id', clienteAlvoId)
    }
  }

  /* Salva tamanhos nos insights */
  const tamCamiseta = ['tamanho_camiseta', 'tamanho', 'camiseta'].map(c => dadosAtualizados[c]).find(v => v != null)
  const tamCalca = ['tamanho_calca', 'numeracao_calca', 'calca'].map(c => dadosAtualizados[c]).find(v => v != null)
  const tamTenis = ['tamanho_tenis', 'numero_tenis', 'tenis'].map(c => dadosAtualizados[c]).find(v => v != null)

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

  /* Ao concluir, limpa todos os estados aguardando desse contato para evitar loop */
  if (acao.concluido) {
    await admin.from('agente_conversa_estado')
      .update({ status: 'concluido', updated_at: new Date().toISOString() })
      .eq('contato_id', contato.id)
      .eq('status', 'aguardando')
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
