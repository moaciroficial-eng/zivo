import { sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppImage, sendWhatsAppMessage, primeiroNome, type WhatsAppCreds } from '@/lib/whatsapp'

/* ══════════════════════════════════════════════════════════════
   QUALIFICAÇÃO AUTOMÁTICA — 3 perguntas (categoria, tamanho, preferência)

   Fluxo determinístico (sem IA): dispara na primeira mensagem do cliente
   (ou 7+ dias sem conversa, ou frase-gatilho), faz 3 perguntas por botão/
   lista, aceita resposta digitada também, salva no cadastro do cliente e
   busca fotos no estoque. Chamado de processarEventoInbound ANTES do
   atendimento normal de IA -- se tratar a mensagem, a IA não responde
   por cima (ver `tratou` no retorno).

   Toda mensagem que esse fluxo manda é gravada com raw.origem='qualificacao'
   -- isso também pausa o atendimento de IA (humanoAtivoNaConversa trata
   qualquer origem != 'ia' como "alguém já está conduzindo a conversa"),
   que é exatamente o comportamento que queremos enquanto o fluxo roda.
   ══════════════════════════════════════════════════════════════ */

const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const FRASES_GATILHO = ['vim pela live', 'black', 'quero ver as peças']
const JANELA_RODOU_MS = 24 * 60 * 60 * 1000
const JANELA_HUMANO_MS = 12 * 60 * 60 * 1000
const GAP_DIAS_REINICIO = 7

type Opcao = { id: string; titulo: string; valor?: string; sinonimos: string[] }

const CATEGORIAS: Opcao[] = [
  { id: 'cat_camiseta', titulo: 'Camiseta', sinonimos: ['camiseta', 'camisetas'] },
  { id: 'cat_polo', titulo: 'Polo', sinonimos: ['polo', 'polos'] },
  { id: 'cat_camisa', titulo: 'Camisa', sinonimos: ['camisa', 'camisas'] },
  { id: 'cat_bermuda', titulo: 'Bermuda/Shorts', sinonimos: ['bermuda', 'bermudas', 'short', 'shorts'] },
  { id: 'cat_calca', titulo: 'Calça', sinonimos: ['calca', 'calça', 'calcas', 'calças'] },
  { id: 'cat_outro', titulo: 'Outro', sinonimos: ['outro', 'outros', 'outra coisa'] },
]
const TAMANHOS: Opcao[] = [
  { id: 'tam_p', titulo: 'P', sinonimos: ['p'] },
  { id: 'tam_m', titulo: 'M', sinonimos: ['m'] },
  { id: 'tam_g', titulo: 'G', sinonimos: ['g'] },
  { id: 'tam_gg', titulo: 'GG', sinonimos: ['gg'] },
  { id: 'tam_xgg', titulo: 'XGG', sinonimos: ['xgg', 'xg', 'exgg'] },
]
const PREFERENCIAS: Opcao[] = [
  { id: 'pref_lisa', titulo: 'Lisa', valor: 'lisa', sinonimos: ['lisa', 'liso'] },
  { id: 'pref_estampada', titulo: 'Estampada', valor: 'estampada', sinonimos: ['estampada', 'estampado', 'estampa'] },
  { id: 'pref_tanto_faz', titulo: 'Tanto faz', valor: 'tanto_faz', sinonimos: ['tanto faz', 'qualquer', 'indiferente', 'nao importa', 'não importa'] },
]

/* Palavra-chave de busca no estoque por categoria -- a coluna `categoria`
   do estoque só aceita ('camiseta','regata','calca','tenis','outros'), bem
   mais estreita que nossas 6 opções, então casamos por palavra no nome/
   marca/cor/categoria (igual já faz /api/whatsapp/produtos-foto) em vez de
   depender só do enum. "Outro" não busca -- fica vago pra confiar num
   catálogo cheio de resultados aleatórios. */
const PALAVRA_ESTOQUE: Record<string, string> = {
  'Camiseta': 'camiseta', 'Polo': 'polo', 'Camisa': 'camisa',
  'Bermuda/Shorts': 'bermuda', 'Calça': 'calca',
}

function casarOpcao(opcoes: Opcao[], textoNormalizado: string, interactiveId?: string | null): Opcao | null {
  if (interactiveId) {
    const porId = opcoes.find(o => o.id === interactiveId)
    if (porId) return porId
  }
  const tokens = textoNormalizado.split(/\s+/).filter(Boolean)
  for (const o of opcoes) {
    for (const s of o.sinonimos) {
      const sn = norm(s)
      if (sn.includes(' ') ? textoNormalizado.includes(sn) : tokens.includes(sn)) return o
    }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

type ContatoQual = { id: string; nome: string | null; phone: string; cliente_id: string | null; campanha_id?: string | null }
type MsgQual = { conteudo: string | null; tipo: string; timestamp: string; interactiveId?: string | null }

/* Grava a mensagem enviada pelo fluxo no histórico (mesmo padrão de toda
   mensagem enviada pela IA/sistema no projeto) + atualiza a prévia do contato. */
async function registrarEnvio(admin: Admin, userId: string, contato: ContatoQual, messageId: string | undefined, conteudo: string, etapa: string, raw: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString()
  await admin.from('whatsapp_mensagens').insert({
    user_id: userId, contato_id: contato.id, message_id: messageId ?? null,
    direcao: 'enviada', tipo: 'texto', conteudo, status: 'enviada', timestamp,
    raw: { origem: 'qualificacao', etapa, ...raw },
  })
  await admin.from('whatsapp_contatos').update({ ultima_mensagem: conteudo, ultima_mensagem_at: timestamp }).eq('id', contato.id)
}

async function enviarPerguntaCategoria(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined, prefixo = '') {
  const nome = primeiroNome(contato.nome, '')
  const corpo = `${prefixo}Oi${nome ? `, ${nome}` : ''}! Que bom te ver por aqui 😊 O que você tá procurando?`
  const { messageId } = await sendWhatsAppList({
    phone: contato.phone, corpo, textoBotao: 'Escolher',
    linhas: CATEGORIAS.map(c => ({ id: c.id, titulo: c.titulo })),
    creds, userId,
  })
  await registrarEnvio(admin, userId, contato, messageId, corpo, 'categoria')
}

async function enviarPerguntaTamanho(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined, prefixo = '') {
  const corpo = `${prefixo}Qual o seu tamanho?`
  const { messageId } = await sendWhatsAppList({
    phone: contato.phone, corpo, textoBotao: 'Escolher',
    linhas: TAMANHOS.map(t => ({ id: t.id, titulo: t.titulo })),
    creds, userId,
  })
  await registrarEnvio(admin, userId, contato, messageId, corpo, 'tamanho')
}

async function enviarPerguntaPreferencia(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined, prefixo = '') {
  const corpo = `${prefixo}Prefere lisa ou estampada?`
  const { messageId } = await sendWhatsAppButtons({
    phone: contato.phone, corpo,
    botoes: PREFERENCIAS.map(p => ({ id: p.id, titulo: p.titulo })),
    creds, userId,
  })
  await registrarEnvio(admin, userId, contato, messageId, corpo, 'preferencia')
}

function mapCategoriaParaColunaCliente(categoria: string | null): 'tamanho_camiseta' | 'tamanho_calca' | null {
  if (categoria === 'Camiseta' || categoria === 'Polo' || categoria === 'Camisa') return 'tamanho_camiseta'
  if (categoria === 'Bermuda/Shorts' || categoria === 'Calça') return 'tamanho_calca'
  return null
}

type ItemEstoque = { estoque_id: string; nome: string; marca: string | null; preco: number | null; foto_url: string }

async function buscarEstoqueQualificacao(admin: Admin, userId: string, categoria: string, tamanho: string): Promise<ItemEstoque[]> {
  const palavra = PALAVRA_ESTOQUE[categoria]
  if (!palavra) return []
  const [{ data: estoque }, { data: fotos }] = await Promise.all([
    admin.from('estoque').select('id,nome,marca,cor,categoria,preco_venda,preco_promocional,promocao_valida_until,tamanhos,status')
      .eq('user_id', userId).not('status', 'eq', 'vendido'),
    admin.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', userId),
  ])
  const fotoDe = new Map<string, string>()
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] }[]) {
    for (const id of f.estoque_ids ?? []) if (!fotoDe.has(id)) fotoDe.set(id, f.url)
  }
  const nb = norm(palavra)
  const nt = norm(tamanho)
  const hoje = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = { id: string; nome: string; marca: string | null; cor: string | null; categoria: string; preco_venda: number; preco_promocional: number | null; promocao_valida_until: string | null; tamanhos: { tamanho: string | number; qtd: number }[] | null }
  return ((estoque ?? []) as Row[])
    .filter(e => fotoDe.has(e.id))
    .map(e => {
      const tamanhosNorm = (e.tamanhos ?? []).filter(t => Number(t.qtd) > 0).map(t => norm(String(t.tamanho)))
      const haystack = norm([e.nome, e.marca, e.cor, e.categoria].filter(Boolean).join(' '))
      const promoValida = e.preco_promocional != null && (!e.promocao_valida_until || e.promocao_valida_until >= hoje)
      return {
        estoque_id: e.id, nome: e.nome, marca: e.marca,
        preco: promoValida ? e.preco_promocional : e.preco_venda,
        foto_url: fotoDe.get(e.id)!,
        casa: haystack.includes(nb) && tamanhosNorm.includes(nt),
      }
    })
    .filter(x => x.casa)
    .map(({ estoque_id, nome, marca, preco, foto_url }) => ({ estoque_id, nome, marca, preco, foto_url }))
}

function fmtPreco(n: number | null): string {
  return n != null ? `R$${n.toFixed(2).replace('.', ',')}` : ''
}

async function enviarResultadoEstoque(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined, categoria: string, tamanho: string) {
  const itens = await buscarEstoqueQualificacao(admin, userId, categoria, tamanho)
  if (itens.length === 0) {
    const texto = 'Vou conferir aqui e já te mando 😉'
    const { messageId } = await sendWhatsAppMessage({ phone: contato.phone, message: texto, creds, userId })
    await registrarEnvio(admin, userId, contato, messageId, texto, 'resultado')
    return
  }
  const primeiros = itens.slice(0, 4)
  for (let i = 0; i < primeiros.length; i++) {
    const it = primeiros[i]
    const legenda = `${i + 1}. ${[it.nome, it.marca].filter(Boolean).join(' ')} — ${fmtPreco(it.preco)}`
    try {
      const { messageId } = await sendWhatsAppImage({ phone: contato.phone, imageUrl: it.foto_url, caption: legenda, creds, userId })
      await admin.from('whatsapp_mensagens').insert({
        user_id: userId, contato_id: contato.id, message_id: messageId ?? null,
        direcao: 'enviada', tipo: 'imagem', conteudo: legenda, status: 'enviada', timestamp: new Date().toISOString(),
        raw: { origem: 'qualificacao', etapa: 'resultado', image: { imageUrl: it.foto_url, caption: legenda, ofertaId: null } },
      })
    } catch { /* uma foto falhando não derruba as outras */ }
  }
  if (itens.length > 4) {
    const { messageId } = await sendWhatsAppButtons({
      phone: contato.phone, corpo: 'Quer ver mais opções?',
      botoes: [{ id: 'qualificacao_ver_mais', titulo: 'Ver mais opções' }],
      creds, userId,
    })
    await registrarEnvio(admin, userId, contato, messageId, 'Quer ver mais opções?', 'resultado')
  }
}

/* Toque em "Ver mais opções" -- manda o resto em texto (nome + preço, sem
   mais fotos, pra não virar um bombardeio de imagem) usando a categoria/
   tamanho já salvos na última qualificação desse contato, mesmo concluída. */
async function tratarVerMais(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined): Promise<boolean> {
  const { data: qual } = await admin.from('whatsapp_qualificacao').select('categoria, tamanho').eq('contato_id', contato.id).maybeSingle()
  if (!qual?.categoria || !qual?.tamanho) return false
  const itens = await buscarEstoqueQualificacao(admin, userId, qual.categoria, qual.tamanho)
  const resto = itens.slice(4)
  const texto = resto.length > 0
    ? `Mais opções:\n${resto.map(it => `• ${[it.nome, it.marca].filter(Boolean).join(' ')} — ${fmtPreco(it.preco)}`).join('\n')}\n\nMe chama se quiser ver alguma foto específica!`
    : 'Essas foram todas as opções que temos agora 🙏 Me chama se quiser ver alguma em especial.'
  const { messageId } = await sendWhatsAppMessage({ phone: contato.phone, message: texto, creds, userId })
  await registrarEnvio(admin, userId, contato, messageId, texto, 'resultado')
  return true
}

/* Dono/atendente assumiu a conversa DEPOIS que esse fluxo começou
   (mensagem enviada sem marcador de origem = mandada na mão) -> cancela. */
async function donoAssumiuDepois(admin: Admin, contatoId: string, desde: string): Promise<boolean> {
  const { data } = await admin.from('whatsapp_mensagens')
    .select('raw').eq('contato_id', contatoId).eq('direcao', 'enviada')
    .gt('timestamp', desde).order('timestamp', { ascending: false }).limit(5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).some(m => !(m.raw as { origem?: string } | null)?.origem)
}

async function deveDisparar(admin: Admin, userId: string, contato: ContatoQual, msg: MsgQual): Promise<boolean> {
  const { data: cfg } = await admin.from('loja_config').select('owner_phone').eq('user_id', userId).maybeSingle()
  const ownerPhone = (cfg?.owner_phone ?? process.env.OWNER_PHONE ?? '').replace(/\D/g, '')
  const phoneLimpo = contato.phone.replace(/\D/g, '')
  if (ownerPhone && (phoneLimpo.slice(-11) === ownerPhone.slice(-11) || phoneLimpo.slice(-8) === ownerPhone.slice(-8))) return false

  const desde12h = new Date(Date.now() - JANELA_HUMANO_MS).toISOString()
  const { data: enviadasRecentes } = await admin.from('whatsapp_mensagens')
    .select('raw').eq('contato_id', contato.id).eq('direcao', 'enviada')
    .gte('timestamp', desde12h).order('timestamp', { ascending: false }).limit(10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (((enviadasRecentes ?? []) as any[]).some(m => !(m.raw as { origem?: string } | null)?.origem)) return false

  const texto = norm(msg.conteudo ?? '')
  if (FRASES_GATILHO.some(f => texto.includes(norm(f)))) return true

  const { data: anteriores } = await admin.from('whatsapp_mensagens')
    .select('timestamp').eq('contato_id', contato.id).eq('direcao', 'recebida')
    .lt('timestamp', msg.timestamp).order('timestamp', { ascending: false }).limit(1)
  const ultimaAnterior = anteriores?.[0]?.timestamp as string | undefined
  if (!ultimaAnterior) return true
  const gapDias = (new Date(msg.timestamp).getTime() - new Date(ultimaAnterior).getTime()) / 86_400_000
  return gapDias >= GAP_DIAS_REINICIO
}

async function finalizarQualificacao(admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined, qualId: string, categoria: string, tamanho: string, preferencia: Opcao, origem: string | null) {
  const colunaTamanho = mapCategoriaParaColunaCliente(categoria)
  const updateCliente: Record<string, unknown> = {
    origem_lead: origem, preferencia_estampa: preferencia.valor,
  }
  if (colunaTamanho) updateCliente[colunaTamanho] = tamanho

  let clienteId = contato.cliente_id
  if (clienteId) {
    await admin.from('clientes').update(updateCliente).eq('id', clienteId)
  } else {
    const { data: novo } = await admin.from('clientes')
      .insert({ user_id: userId, nome: contato.nome || 'Cliente', telefone: contato.phone, ...updateCliente })
      .select('id').single()
    clienteId = novo?.id ?? null
    if (clienteId) await admin.from('whatsapp_contatos').update({ cliente_id: clienteId }).eq('id', contato.id)
  }

  const agora = new Date().toISOString()
  await admin.from('whatsapp_contatos').update({ lead_qualificado: true }).eq('id', contato.id)
  await admin.from('whatsapp_qualificacao').update({
    status: 'concluido', preferencia: preferencia.valor, concluido_at: agora, updated_at: agora,
  }).eq('id', qualId)

  await enviarResultadoEstoque(admin, userId, contato, creds, categoria, tamanho)
}

async function avancarFluxo(
  admin: Admin, userId: string, contato: ContatoQual, creds: WhatsAppCreds | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qual: any, msg: MsgQual,
): Promise<boolean> {
  const texto = norm(msg.conteudo ?? '')

  if (qual.status === 'aguardando_categoria') {
    const opt = casarOpcao(CATEGORIAS, texto, msg.interactiveId)
    if (!opt) { await enviarPerguntaCategoria(admin, userId, contato, creds, 'Não entendi 🙏 '); return true }
    await admin.from('whatsapp_qualificacao').update({ categoria: opt.titulo, status: 'aguardando_tamanho', updated_at: new Date().toISOString() }).eq('id', qual.id)
    await enviarPerguntaTamanho(admin, userId, contato, creds)
    return true
  }
  if (qual.status === 'aguardando_tamanho') {
    const opt = casarOpcao(TAMANHOS, texto, msg.interactiveId)
    if (!opt) { await enviarPerguntaTamanho(admin, userId, contato, creds, 'Não entendi 🙏 '); return true }
    await admin.from('whatsapp_qualificacao').update({ tamanho: opt.titulo, status: 'aguardando_preferencia', updated_at: new Date().toISOString() }).eq('id', qual.id)
    await enviarPerguntaPreferencia(admin, userId, contato, creds)
    return true
  }
  if (qual.status === 'aguardando_preferencia') {
    const opt = casarOpcao(PREFERENCIAS, texto, msg.interactiveId)
    if (!opt) { await enviarPerguntaPreferencia(admin, userId, contato, creds, 'Não entendi 🙏 '); return true }
    await finalizarQualificacao(admin, userId, contato, creds, qual.id, qual.categoria, qual.tamanho, opt, qual.origem)
    return true
  }
  return false
}

/* Ponto de entrada -- chamado de processarEventoInbound pra toda mensagem
   RECEBIDA (texto ou toque em botão/lista, já normalizado como texto).
   Retorna true se tratou a mensagem (não deve cair no atendimento normal). */
export async function processarQualificacao(
  admin: Admin, userId: string, contato: ContatoQual, msg: MsgQual, creds: WhatsAppCreds | undefined,
): Promise<boolean> {
  if (msg.interactiveId === 'qualificacao_ver_mais') {
    if (await tratarVerMais(admin, userId, contato, creds)) return true
  }

  const { data: cfg } = await admin.from('loja_config').select('qualificacao_ativa').eq('user_id', userId).maybeSingle()
  if (cfg?.qualificacao_ativa === false) return false

  const { data: qual } = await admin.from('whatsapp_qualificacao').select('*').eq('contato_id', contato.id).maybeSingle()

  if (qual && qual.status !== 'concluido' && qual.status !== 'cancelado') {
    if (await donoAssumiuDepois(admin, contato.id, qual.iniciado_at)) {
      await admin.from('whatsapp_qualificacao').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', qual.id)
      return false
    }
    return await avancarFluxo(admin, userId, contato, creds, qual, msg)
  }

  if (qual && Date.now() - new Date(qual.iniciado_at).getTime() < JANELA_RODOU_MS) return false
  if (!(await deveDisparar(admin, userId, contato, msg))) return false

  const origem = FRASES_GATILHO.some(f => norm(msg.conteudo ?? '').includes(norm(f)) && f === 'vim pela live')
    ? 'live'
    : (contato.campanha_id ? 'campanha' : 'organico')

  const agora = new Date().toISOString()
  await admin.from('whatsapp_qualificacao').upsert({
    user_id: userId, contato_id: contato.id, status: 'aguardando_categoria',
    categoria: null, tamanho: null, preferencia: null, origem,
    iniciado_at: agora, concluido_at: null, updated_at: agora,
  }, { onConflict: 'contato_id' })

  await enviarPerguntaCategoria(admin, userId, contato, creds)
  return true
}
