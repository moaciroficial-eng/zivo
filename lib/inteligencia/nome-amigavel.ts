import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ maxRetries: 1 })

/* ══════════════════════════════════════════════════════════════
   NOME AMIGÁVEL — "nome falado" do produto, gerado por IA UMA VEZ só
   e guardado pra sempre em estoque.nome_amigavel. Não é gerado de novo
   a cada mensagem (custo é por produto cadastrado, não por envio).

   Ex.: "POLO BÁSICA 4 FRISOS BORDEAUX INTENSO 117" -> "polo bordô"
   ══════════════════════════════════════════════════════════════ */

async function gerarNomeAmigavel(nome: string, marca: string | null): Promise<string> {
  // timeout curto -- essa chamada roda no caminho de carregamento do Painel/
  // IA; sem limite, um engasgo de rede/API trava a página esperando (era a
  // causa do /dashboard "congelar" às vezes depois de importar produto novo).
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 40,
    system: 'Você transforma nomes de produtos de catálogo de loja de roupas/calçados num jeito natural de falar em português do Brasil — bem curto, como um vendedor diria numa conversa de WhatsApp. Tire código de referência, detalhe técnico de construção (frisos, costuras) e qualificador de cor redundante (ex: "intenso", "liso"). Traduza nome de cor em inglês/técnico pro termo comum em português (ex: bordeaux -> bordô, off white -> branco). NUNCA inclua o nome da marca no resultado — ela já é mostrada separada, à parte. Responda APENAS com o nome curto (2 a 4 palavras), tudo minúsculo, sem pontuação, sem aspas, sem a marca, sem explicação.',
    messages: [{
      role: 'user',
      content: `Nome do cadastro: "${nome}"${marca ? ` | marca: ${marca} (NÃO inclua esta palavra no resultado)` : ''}\nExemplos: "POLO BÁSICA 4 FRISOS BORDEAUX INTENSO 117" (marca: Aramis) -> polo bordô | "TENIS CASUAL OFF WHITE REF 2201" (marca: Nike) -> tênis branco\nTransforme:`,
    }],
  }, { timeout: 4000 })
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const limpo = text.trim().toLowerCase().replace(/^["'“”]+|["'“”]+$/g, '').replace(/[.!]+$/, '')
  return limpo.slice(0, 60) || nome.toLowerCase()
}

type ProdutoLite = { id: string; nome: string; marca: string | null }

/* Garante o nome_amigavel de uma lista de produtos: lê o que já existe,
   gera (Haiku) só o que falta e salva pra nunca mais precisar gerar de
   novo. Devolve um mapa produtoId -> nome_amigavel (só os que deram certo —
   quem falhar, o caller usa o fallback determinístico limparNomeProduto). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function garantirNomesAmigaveis(admin: any, produtos: ProdutoLite[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (!produtos.length) return mapa

  const porId = new Map<string, ProdutoLite>()
  for (const p of produtos) porId.set(p.id, p)
  const ids = [...porId.keys()]

  const { data: rows } = await admin.from('estoque').select('id, nome_amigavel').in('id', ids)
  const existentes = new Map<string, string | null>((rows ?? []).map((r: { id: string; nome_amigavel: string | null }) => [r.id, r.nome_amigavel]))

  const faltando: ProdutoLite[] = []
  for (const id of ids) {
    const existente = existentes.get(id)
    if (existente) mapa.set(id, existente)
    else faltando.push(porId.get(id)!)
  }
  if (!faltando.length) return mapa

  /* Lista é pequena (tamanho do feed de oportunidades, ~30-40) — gera em
     paralelo. Uma falha isolada não derruba o resto nem o restante da tela. */
  await Promise.all(faltando.map(async (p) => {
    try {
      const gerado = await gerarNomeAmigavel(p.nome, p.marca)
      mapa.set(p.id, gerado)
      await admin.from('estoque').update({ nome_amigavel: gerado }).eq('id', p.id)
    } catch { /* segue sem nome_amigavel pra esse produto */ }
  }))
  return mapa
}
