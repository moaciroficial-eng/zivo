import { normalizarTelefoneBR, sendWhatsAppTemplate, type WhatsAppCreds } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   DISPARO DE TEMPLATE EM MASSA — monta público + envia em lotes

   Fora da janela de 24h a Meta só aceita template aprovado. Esta tela
   deixa o dono escolher o template, filtrar quem recebe, revisar a
   lista e disparar em lotes pequenos (o navegador chama a rota de
   lote repetidas vezes — mesmo padrão da foto de produto no chat).
   ══════════════════════════════════════════════════════════════ */

export type FiltroPublico = {
  genero?: 'M' | 'F' | null
  compradosDesdeDias?: number | null      // só quem comprou nos últimos X dias
  naoCompradosDesdeDias?: number | null   // exclui quem comprou nos últimos X dias
  aniversariantesMes?: boolean
  nomeComeca?: string | null              // nome começa com esse prefixo (ex: "A")
  produtoTermo?: string | null            // compraram algo cujo nome bate com esse termo (produto, categoria ou marca)
  gastoMinimo?: number | null             // gastou (total) mais que esse valor em R$
  gastoDesdeAno?: boolean                 // se true, o gastoMinimo conta só desde 1º de janeiro deste ano
  qtdComprasMin?: number | null           // número mínimo de compras (all-time)
}

export type PessoaPublico = { clienteId: string; contatoId: string | null; nome: string; phone: string }

/* Minúsculo + sem acento, pra comparar nome/produto sem exigir digitar
   exatamente igual ("Aramis" bate com "aramis", "polo" bate com "Polo"). */
function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/* Monta a lista final de quem recebe, já aplicando as exclusões automáticas:
   sem telefone válido, telefone repetido (manda uma vez só) e quem pediu
   pra não receber mais (whatsapp_contatos.nao_receber). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function montarPublico(admin: any, userId: string, filtro: FiltroPublico): Promise<{
  pessoas: PessoaPublico[]
  excluidos: { semTelefone: number; optOut: number; duplicado: number }
}> {
  const { data: clientesRows } = await admin.from('clientes')
    .select('id, nome, telefone, genero, data_nascimento').eq('user_id', userId)
  let clientes = (clientesRows ?? []) as { id: string; nome: string | null; telefone: string | null; genero: string | null; data_nascimento: string | null }[]

  if (filtro.genero) clientes = clientes.filter(c => c.genero === filtro.genero)

  if (filtro.nomeComeca) {
    const prefixo = normalizarTexto(filtro.nomeComeca)
    clientes = clientes.filter(c => normalizarTexto(c.nome ?? '').startsWith(prefixo))
  }

  if (filtro.aniversariantesMes) {
    const mesAtual = new Date().getMonth() + 1
    clientes = clientes.filter(c => {
      if (!c.data_nascimento) return false
      return Number(c.data_nascimento.slice(5, 7)) === mesAtual
    })
  }

  const precisaVendas = filtro.compradosDesdeDias != null || filtro.naoCompradosDesdeDias != null
    || !!filtro.produtoTermo || filtro.gastoMinimo != null || filtro.qtdComprasMin != null

  if (precisaVendas) {
    const ids = clientes.map(c => c.id)
    type Agregado = { ultimaCompra: number | null; totalGasto: number; totalGastoAno: number; qtdCompras: number; temProduto: boolean }
    const porCliente = new Map<string, Agregado>()
    if (ids.length) {
      const { data: vendas } = await admin.from('vendas')
        .select('cliente_id, data_venda, valor, produtos').in('cliente_id', ids)
      const termo = filtro.produtoTermo ? normalizarTexto(filtro.produtoTermo) : null
      const inicioAno = new Date(new Date().getFullYear(), 0, 1).getTime()
      for (const v of (vendas ?? []) as { cliente_id: string | null; data_venda: string; valor: number; produtos: { nome?: string }[] | null }[]) {
        if (!v.cliente_id) continue
        const t = new Date(v.data_venda).getTime()
        const ag = porCliente.get(v.cliente_id) ?? { ultimaCompra: null, totalGasto: 0, totalGastoAno: 0, qtdCompras: 0, temProduto: false }
        if (ag.ultimaCompra == null || t > ag.ultimaCompra) ag.ultimaCompra = t
        ag.totalGasto += Number(v.valor) || 0
        if (t >= inicioAno) ag.totalGastoAno += Number(v.valor) || 0
        ag.qtdCompras += 1
        if (termo && !ag.temProduto) {
          ag.temProduto = (v.produtos ?? []).some(p => p?.nome && normalizarTexto(p.nome).includes(termo))
        }
        porCliente.set(v.cliente_id, ag)
      }
    }
    const agora = Date.now()
    if (filtro.compradosDesdeDias != null) {
      const limite = filtro.compradosDesdeDias
      clientes = clientes.filter(c => {
        const u = porCliente.get(c.id)?.ultimaCompra
        return u != null && Math.round((agora - u) / 86400000) <= limite
      })
    }
    if (filtro.naoCompradosDesdeDias != null) {
      const limite = filtro.naoCompradosDesdeDias
      clientes = clientes.filter(c => {
        const u = porCliente.get(c.id)?.ultimaCompra
        return u == null || Math.round((agora - u) / 86400000) >= limite
      })
    }
    if (filtro.produtoTermo) {
      clientes = clientes.filter(c => porCliente.get(c.id)?.temProduto === true)
    }
    if (filtro.gastoMinimo != null) {
      const limite = filtro.gastoMinimo
      clientes = clientes.filter(c => {
        const ag = porCliente.get(c.id)
        const gasto = filtro.gastoDesdeAno ? (ag?.totalGastoAno ?? 0) : (ag?.totalGasto ?? 0)
        return gasto > limite
      })
    }
    if (filtro.qtdComprasMin != null) {
      const limite = filtro.qtdComprasMin
      clientes = clientes.filter(c => (porCliente.get(c.id)?.qtdCompras ?? 0) >= limite)
    }
  }

  const { data: contatosRows } = await admin.from('whatsapp_contatos')
    .select('id, cliente_id, phone, nao_receber').eq('user_id', userId).not('cliente_id', 'is', null)
  const contatoPorCliente = new Map<string, { id: string; phone: string; nao_receber: boolean }>()
  for (const c of (contatosRows ?? []) as { id: string; cliente_id: string | null; phone: string; nao_receber: boolean }[]) {
    if (c.cliente_id) contatoPorCliente.set(c.cliente_id, c)
  }

  const vistos = new Set<string>()
  const pessoas: PessoaPublico[] = []
  let semTelefone = 0, optOut = 0, duplicado = 0

  for (const c of clientes) {
    const ct = contatoPorCliente.get(c.id)
    if (ct?.nao_receber) { optOut++; continue }
    const telRaw = ct?.phone || c.telefone
    if (!telRaw) { semTelefone++; continue }
    const phone = normalizarTelefoneBR(telRaw)
    if (phone.length < 12 || phone.length > 13) { semTelefone++; continue }
    if (vistos.has(phone)) { duplicado++; continue }
    vistos.add(phone)
    pessoas.push({ clienteId: c.id, contatoId: ct?.id ?? null, nome: c.nome || 'Cliente', phone })
  }

  return { pessoas, excluidos: { semTelefone, optOut, duplicado } }
}

/* Substitui {{1}}, {{2}}... pelo valor correspondente -- só pra registrar
   um texto legível no histórico do chat (a Meta já recebeu as variáveis
   separadas, isso aqui é só exibição). */
export function renderTemplateTexto(bodyText: string | undefined, variaveis: string[]): string {
  if (!bodyText) return variaveis.join(' · ')
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => variaveis[Number(n) - 1] ?? '')
}

export type ResultadoEnvioLote = { id: string; ok: boolean; messageId?: string; erro?: string }

/* Envia o template pra uma pessoa e grava no histórico do chat dela (se
   tiver contato vinculado) -- pra o dono ver na conversa o que foi mandado,
   igual qualquer outra mensagem da IA. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enviarTemplateDisparo(admin: any, opts: {
  userId: string
  phone: string
  contatoId: string | null
  templateName: string
  variaveis: string[]
  bodyText?: string
  creds?: WhatsAppCreds
}): Promise<{ ok: boolean; messageId?: string; erro?: string }> {
  try {
    const { messageId } = await sendWhatsAppTemplate({
      phone: opts.phone, templateName: opts.templateName, variaveis: opts.variaveis,
      creds: opts.creds, userId: opts.userId,
    })
    if (opts.contatoId) {
      const timestamp = new Date().toISOString()
      try {
        await admin.from('whatsapp_mensagens').insert({
          user_id: opts.userId, contato_id: opts.contatoId, message_id: messageId ?? null,
          direcao: 'enviada', tipo: 'texto', conteudo: renderTemplateTexto(opts.bodyText, opts.variaveis),
          status: 'enviada', timestamp, raw: { origem: 'ia', via: 'template', disparo: true },
        })
        await admin.from('whatsapp_contatos').update({ ultima_mensagem_at: timestamp }).eq('id', opts.contatoId)
      } catch { /* histórico é secundário */ }
    }
    return { ok: true, messageId }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export const LOTE_TAMANHO = 25

/* Processa até `limite` envios pendentes de um disparo. Usado tanto pela
   rota manual (o dono acompanha na tela, "agora") quanto pelo cron
   (agendado -- ninguém olhando a tela, roda sozinho em lotes a cada
   execução até esvaziar). Idempotente: só pega quem ainda está 'pendente'. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processarLoteDisparo(admin: any, disparoId: string, creds: WhatsAppCreds | undefined, limite = LOTE_TAMANHO): Promise<{
  processados: number; enviados: number; falhas: number; restantes: number
}> {
  const { data: disparo } = await admin.from('disparo_templates')
    .select('id, user_id, template_name, variaveis_extra').eq('id', disparoId).maybeSingle()
  if (!disparo) return { processados: 0, enviados: 0, falhas: 0, restantes: 0 }

  const extras = (disparo.variaveis_extra ?? {}) as { bodyText?: string }

  const { data: pendentes } = await admin.from('disparo_template_envios')
    .select('id, contato_id, phone, variaveis').eq('disparo_id', disparoId).eq('status', 'pendente')
    .order('created_at', { ascending: true }).limit(limite)

  const lista = (pendentes ?? []) as { id: string; contato_id: string | null; phone: string; variaveis: string[] }[]
  let enviados = 0, falhas = 0

  for (const envio of lista) {
    const r = await enviarTemplateDisparo(admin, {
      userId: disparo.user_id, phone: envio.phone, contatoId: envio.contato_id,
      templateName: disparo.template_name, variaveis: envio.variaveis ?? [], bodyText: extras.bodyText, creds,
    })
    if (r.ok) {
      enviados++
      await admin.from('disparo_template_envios').update({
        status: 'enviado', message_id: r.messageId ?? null, updated_at: new Date().toISOString(),
      }).eq('id', envio.id)
    } else {
      falhas++
      await admin.from('disparo_template_envios').update({
        status: 'falhou', motivo_falha: r.erro ?? 'Falha no envio', updated_at: new Date().toISOString(),
      }).eq('id', envio.id)
    }
  }

  const { count: restantes } = await admin.from('disparo_template_envios')
    .select('id', { count: 'exact', head: true }).eq('disparo_id', disparoId).eq('status', 'pendente')

  await admin.from('disparo_templates').update({
    status: (restantes ?? 0) > 0 ? 'enviando' : 'concluido',
  }).eq('id', disparoId)

  return { processados: lista.length, enviados, falhas, restantes: restantes ?? 0 }
}
