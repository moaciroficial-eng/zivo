import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type HistoricoItem = { papel: string; texto: string }

interface Contato {
  id: string
  nome: string | null
  phone: string
  cliente_id: string | null
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

  if (respostaContato) {
    historico.push({ papel: 'contato', texto: respostaContato })
  }

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Você é um agente executando uma tarefa via WhatsApp.

TAREFA: ${tarefa.instrucao}

CONTATO: ${contato.nome ?? contato.phone}
DADOS JÁ COLETADOS: ${JSON.stringify(estado.dados_coletados)}

HISTÓRICO:
${historico.map(h => `[${h.papel.toUpperCase()}] ${h.texto}`).join('\n') || '(início da conversa)'}

Decida o próximo passo. JSON:
{
  "proxima_mensagem": "mensagem para o contato (null se tarefa concluída)",
  "dados_novos": {},
  "concluido": false,
  "salvar_no_cliente": {
    "nome": "nome completo se coletou",
    "data_nascimento": "DD/MM/AAAA se coletou",
    "telefone": "se coletou"
  }
}

REGRAS:
- Use "${nomeContato}" para personalizar
- Primeira mensagem (histórico vazio): envie a saudação pedindo os dados
- Se ainda falta informação: faça UMA pergunta de cada vez
- Quando tiver todos os dados: agradeça e marque concluido: true
- salvar_no_cliente: só inclua o que realmente coletou NESTA resposta`,
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

  /* Merge de dados coletados */
  const dadosAtualizados = {
    ...(estado.dados_coletados ?? {}),
    ...(acao.dados_novos ?? {}),
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
    }
    if (Object.keys(update).length > 0) {
      await admin.from('clientes').update(update).eq('id', clienteAlvoId)
    }
  }

  /* Salva tamanhos nos insights */
  if (dadosAtualizados.tamanho_camiseta || dadosAtualizados.numeracao_calca) {
    const tamanhos: string[] = []
    if (dadosAtualizados.tamanho_camiseta) tamanhos.push(String(dadosAtualizados.tamanho_camiseta))
    if (dadosAtualizados.numeracao_calca) tamanhos.push(String(dadosAtualizados.numeracao_calca))
    await admin.from('contato_insights').upsert({
      user_id: userId, contato_id: contato.id,
      cliente_id: contato.cliente_id ?? null,
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

  if (acao.concluido) {
    const novoConcluidos = (tarefa.concluidos ?? 0) + 1
    await admin.from('agente_tarefas').update({
      concluidos: novoConcluidos,
      status: novoConcluidos >= (tarefa.total ?? 1) ? 'concluida' : 'ativa',
    }).eq('id', tarefa.id)
  }

  return { respondeu: !!acao.proxima_mensagem, concluido: !!acao.concluido }
}
