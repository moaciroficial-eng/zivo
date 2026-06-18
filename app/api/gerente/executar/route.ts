import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { userId, tarefaId, contatoId, respostaContato } = await request.json()
  if (!userId || !tarefaId || !contatoId) {
    return NextResponse.json({ ok: false, error: 'params obrigatórios' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* Carrega tarefa e estado */
  const [{ data: tarefa }, { data: estado }, { data: contato }] = await Promise.all([
    admin.from('agente_tarefas').select('*').eq('id', tarefaId).single(),
    admin.from('agente_conversa_estado').select('*').eq('tarefa_id', tarefaId).eq('contato_id', contatoId).single(),
    admin.from('whatsapp_contatos').select('nome, phone, cliente_id').eq('id', contatoId).single(),
  ])

  if (!tarefa || !estado || !contato) return NextResponse.json({ ok: false, error: 'não encontrado' })
  if (estado.status === 'concluido') return NextResponse.json({ ok: true, skipped: 'já concluído' })

  const nomeContato = contato.nome?.split(' ')[0] ?? 'olá'
  const historico = (estado.historico as Array<{ papel: string; texto: string }>) ?? []

  /* Se tem resposta nova do contato, adiciona ao histórico */
  if (respostaContato) {
    historico.push({ papel: 'contato', texto: respostaContato })
  }

  const promptAgente = `Você é um agente de atendimento executando uma tarefa específica via WhatsApp.

TAREFA: ${tarefa.instrucao}

CONTATO: ${contato.nome ?? contato.phone}
DADOS JÁ COLETADOS: ${JSON.stringify(estado.dados_coletados)}

HISTÓRICO DA CONVERSA:
${historico.map(h => `[${h.papel.toUpperCase()}] ${h.texto}`).join('\n') || '(início da conversa)'}

Com base na tarefa e no histórico, decida o próximo passo. Responda APENAS em JSON:
{
  "proxima_mensagem": "mensagem a enviar para o contato agora (null se a tarefa já foi concluída)",
  "dados_novos": { "campo": "valor" },
  "concluido": false,
  "salvar_no_cliente": { "nome": "valor se coletou nome", "data_nascimento": "DD/MM/AAAA se coletou", "telefone": "se coletou" }
}

REGRAS:
- Seja natural e humano, não robotizado
- Use "${nomeContato}" para personalizar
- Se for primeira mensagem (histórico vazio): envie a saudação inicial
- Se já tem todos os dados necessários: agradeça e marque como concluído
- salvar_no_cliente: só inclua campos que você realmente coletou nesta resposta
- dados_novos: campos extras (tamanhos, etc.) que não existem no cadastro`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: promptAgente }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const acao = jsonMatch ? JSON.parse(jsonMatch[0]) : null

  if (!acao) return NextResponse.json({ ok: false, error: 'IA não retornou JSON válido' })

  /* Envia mensagem se houver */
  if (acao.proxima_mensagem) {
    await sendWhatsAppMessage({ phone: contato.phone, message: acao.proxima_mensagem })

    /* Salva no histórico e no banco de mensagens */
    historico.push({ papel: 'agente', texto: acao.proxima_mensagem })
    const timestamp = new Date().toISOString()
    await admin.from('whatsapp_mensagens').insert({
      user_id:    userId,
      contato_id: contatoId,
      direcao:    'enviada',
      tipo:       'texto',
      conteudo:   acao.proxima_mensagem,
      status:     'enviada',
      timestamp,
    })
    await admin.from('whatsapp_contatos').update({
      ultima_mensagem:    acao.proxima_mensagem,
      ultima_mensagem_at: timestamp,
    }).eq('id', contatoId)
  }

  /* Atualiza dados coletados */
  const dadosAtualizados = {
    ...(estado.dados_coletados as Record<string, unknown>),
    ...(acao.dados_novos ?? {}),
  }

  /* Salva no cadastro do cliente se informado */
  if (contato.cliente_id && acao.salvar_no_cliente && Object.keys(acao.salvar_no_cliente).length > 0) {
    const update: Record<string, string> = {}
    if (acao.salvar_no_cliente.nome) update.nome = acao.salvar_no_cliente.nome
    if (acao.salvar_no_cliente.data_nascimento) {
      /* Converte DD/MM/AAAA → AAAA-MM-DD */
      const partes = String(acao.salvar_no_cliente.data_nascimento).split('/')
      if (partes.length === 3) update.data_nascimento = `${partes[2]}-${partes[1]}-${partes[0]}`
    }
    if (Object.keys(update).length > 0) {
      await admin.from('clientes').update(update).eq('id', contato.cliente_id)
    }
  }

  /* Salva tamanhos nos insights se coletados */
  if (dadosAtualizados.tamanho_camiseta || dadosAtualizados.numeracao_calca) {
    const tamanhos: string[] = []
    if (dadosAtualizados.tamanho_camiseta) tamanhos.push(String(dadosAtualizados.tamanho_camiseta))
    if (dadosAtualizados.numeracao_calca) tamanhos.push(String(dadosAtualizados.numeracao_calca))
    await admin.from('contato_insights').upsert({
      user_id:    userId,
      contato_id: contatoId,
      cliente_id: contato.cliente_id ?? null,
      tamanhos,
      ultima_analise: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contato_id' })
  }

  const novoStatus = acao.concluido ? 'concluido' : 'aguardando'

  /* Atualiza estado */
  await admin.from('agente_conversa_estado').update({
    status:          novoStatus,
    historico,
    dados_coletados: dadosAtualizados,
    updated_at:      new Date().toISOString(),
  }).eq('id', estado.id)

  /* Se concluído, atualiza contador da tarefa */
  if (acao.concluido) {
    await admin.from('agente_tarefas')
      .update({ concluidos: (tarefa.concluidos as number) + 1 })
      .eq('id', tarefaId)
  }

  return NextResponse.json({ ok: true, proxima_mensagem: acao.proxima_mensagem, concluido: acao.concluido })
}
