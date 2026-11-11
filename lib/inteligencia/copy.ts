import type { Oportunidade } from '@/lib/inteligencia/oportunidades'
import { limparNomeProduto } from '@/lib/inteligencia/oportunidades'
import { garantirNomesAmigaveis } from '@/lib/inteligencia/nome-amigavel'

/* ══════════════════════════════════════════════════════════════
   COPY DAS OPORTUNIDADES — gera a mensagem pronta (editável) a partir
   de uma Oportunidade do motor. Usado tanto no feed de /ia quanto no
   bloco "Quem chamar hoje" do Painel — um só lugar, mesmo texto.

   Tom de vendedor de loja do interior: curto, próximo, sem exagero.
   No máximo 2 frases + 1 pergunta — e a abertura varia (não é sempre
   "Bom dia, Fulano!"), senão fica cara de robô mandando a mesma coisa
   pra todo mundo.
   ══════════════════════════════════════════════════════════════ */

export type OportunidadeFeed = {
  clienteId: string; clienteNome: string; telefone: string | null
  produtoNome: string; marca: string | null; tamanho: string; motivo: string; tipo: string; copy: string
}

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/* Tira o nome da marca de dentro do nome_amigavel quando ele já aparece lá
   (a IA às vezes repete, ex.: "camiseta aramis" com marca "Aramis") — senão
   a frase sai "camiseta aramis da Aramis". */
function semMarcaRepetida(nome: string, marca: string | null): string {
  if (!marca) return nome
  const marcaLow = marca.toLowerCase().trim()
  if (!marcaLow) return nome
  const re = new RegExp(`\\b${marcaLow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  return nome.replace(re, '').replace(/\s+/g, ' ').trim() || nome
}

/* Artigo indefinido (uma/um) pro nome do produto — heurística simples:
   substantivo de roupa/calçado terminado em "a" costuma ser feminino
   (camiseta, blusa, calça, bermuda, sandália...); o resto, masculino
   (tênis, vestido, chinelo, boné...). Não cobre toda palavra da língua,
   mas cobre bem o vocabulário de loja de roupa/calçado. */
function artigo(nome: string): string {
  const primeira = nome.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return /a$/.test(primeira) ? 'uma' : 'um'
}

/* Artigo definido (o/a) das datas comemorativas — são nome próprio, não dá
   pra adivinhar pela heurística acima. */
const ARTIGO_DATA: Record<string, string> = {
  'Black Friday': 'a', Natal: 'o', 'Ano Novo': 'o',
  'Dia das Mães': 'o', 'Dia dos Namorados': 'o', 'Dia dos Pais': 'o', 'Dia das Crianças': 'o',
}

type Template<Args extends unknown[]> = { verbo: string; fn: (...args: Args) => string }

function sorteiaSimples<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)]
}

/* Sorteia um template evitando repetir o mesmo verbo/palavra-chave que a
   abertura já usou (ex.: "Chegou uma peça... Chegou camiseta preta..." soa
   de robô repetindo a própria frase). Se filtrar tudo, usa a lista toda. */
function sorteiaTemplate<T extends { verbo: string }>(lista: T[], evitarVerbo?: string): T {
  const pool = evitarVerbo ? lista.filter(t => t.verbo !== evitarVerbo) : lista
  return sorteiaSimples(pool.length ? pool : lista)
}

/* Cada função recebe o primeiro nome e devolve a 1ª frase (abertura +
   gancho). Variadas de propósito — a escolha é aleatória a cada geração. */
const ABERTURAS: Template<[string]>[] = [
  { verbo: 'chegou',  fn: (nome) => `${saudacaoBR()}, ${nome}! Chegou uma peça aqui que tem a sua cara.` },
  { verbo: 'separei', fn: (nome) => `${nome}, oi! Separei uma coisa pra você.` },
  { verbo: 'chegou',  fn: (nome) => `${saudacaoBR()}, ${nome}! Acabou de chegar uma peça e lembrei de você na hora.` },
  { verbo: 'chegou',  fn: (nome) => `${nome}! Chegou novidade aqui na loja com a sua cara.` },
  { verbo: 'vi',      fn: (nome) => `Oi, ${nome}! Vi uma peça nova e pensei em você.` },
  { verbo: 'chegou',  fn: (nome) => `${saudacaoBR()}, ${nome}, tudo bem? Chegou algo que acho que você vai curtir.` },
]

/* Cliente sumido há dias (tipo "reativacao") — reencontro, nunca "chegou
   novidade" (ele não some por falta de peça nova, some porque faz tempo
   que não aparece — o tom tem que reconhecer isso). */
const ABERTURAS_REATIVACAO: Template<[string]>[] = [
  { verbo: 'aparece', fn: (nome) => `${nome}, faz tempo que você não aparece por aqui, hein!` },
  { verbo: 'saudade', fn: (nome) => `${saudacaoBR()}, ${nome}! Tava com saudade de te ver por aqui.` },
  { verbo: 'sumiu',   fn: (nome) => `${nome}, sumiu! Tava pensando em você.` },
  { verbo: 'fala',    fn: (nome) => `Oi, ${nome}! Faz um tempinho que a gente não se fala.` },
]

/* O "meio" da mensagem (produto + tamanho) — também varia, senão toda
   mensagem repete a mesma estrutura "É X, no seu tamanho Y" e só a abertura
   muda, o que ainda soa de robô. Tamanho sempre por extenso ("tamanho M"),
   nunca entre parênteses; nome do produto sempre com artigo ("uma camiseta",
   nunca "É camiseta"). */
const OFERTAS: Template<[string, string, string]>[] = [
  { verbo: 'e',       fn: (nome, marcaTxt, tam) => `É ${artigo(nome)} ${nome}${marcaTxt}, no seu tamanho ${tam}.` },
  { verbo: 'peguei',  fn: (nome, marcaTxt, tam) => `Peguei ${artigo(nome)} ${nome}${marcaTxt} aqui, no tamanho ${tam}, bem a sua cara.` },
  { verbo: 'tem',     fn: (nome, marcaTxt, tam) => `Tem ${artigo(nome)} ${nome}${marcaTxt} disponível no seu tamanho, o ${tam}.` },
  { verbo: 'separei', fn: (nome, marcaTxt, tam) => `Separei ${artigo(nome)} ${nome}${marcaTxt} pra você, no tamanho ${tam}.` },
  { verbo: 'chegou',  fn: (nome, marcaTxt, tam) => `Chegou ${artigo(nome)} ${nome}${marcaTxt} e tem no seu tamanho ${tam}.` },
]

/* Reencontro (reativação) — oferta própria, menciona o reencontro em vez
   de só o produto puro. */
const OFERTAS_REATIVACAO: Template<[string, string, string]>[] = [
  { verbo: 'chegou',  fn: (nome, marcaTxt, tam) => `Chegou ${artigo(nome)} ${nome}${marcaTxt} no seu tamanho ${tam} e lembrei de você.` },
  { verbo: 'separei', fn: (nome, marcaTxt, tam) => `Separei ${artigo(nome)} ${nome}${marcaTxt}, no tamanho ${tam}, pra quando você passar aqui de novo.` },
  { verbo: 'tem',     fn: (nome, marcaTxt, tam) => `Tem ${artigo(nome)} ${nome}${marcaTxt} no seu tamanho, o ${tam} — boa desculpa pra aparecer.` },
]

/* Presente — quem compra pra outra pessoa (marido/namorado/esposa/filhos),
   nunca "separei pra você": a peça é pro presenteado, não pro cliente.
   Quando dá pra saber a data (Natal, Black Friday...), ela entra na
   abertura em vez de um "oi" genérico. */
const ABERTURAS_PRESENTE: Template<[string]>[] = [
  { verbo: 'saudacao', fn: (nome) => `${saudacaoBR()}, ${nome}!` },
  { verbo: 'oi',       fn: (nome) => `Oi, ${nome}!` },
  { verbo: 'oi2',      fn: (nome) => `${nome}, oi!` },
]
const ABERTURAS_PRESENTE_DATA: Template<[string, string]>[] = [
  { verbo: 'chegando', fn: (nome, dataArt) => `${nome}, ${dataArt} tá chegando!` },
  { verbo: 'quase',    fn: (nome, dataArt) => `${dataArt.charAt(0).toUpperCase()}${dataArt.slice(1)} já tá quase aí, ${nome}!` },
  { verbo: 'logo',     fn: (nome, dataArt) => `Oi, ${nome}! ${dataArt.charAt(0).toUpperCase()}${dataArt.slice(1)} tá logo aí.` },
]
const REL_PRESENTE: Record<string, string> = {
  marido: 'seu marido', namorado: 'seu namorado', namorada: 'sua namorada',
  esposa: 'sua esposa', filhos: 'seus filhos', presente: 'alguém especial',
}
const OFERTAS_PRESENTE: Template<[string, string, string]>[] = [
  { verbo: 'vi',     fn: (nome, marcaTxt, quem) => `Vi ${artigo(nome)} ${nome}${marcaTxt} que é a cara de ${quem}.` },
  { verbo: 'olhei',  fn: (nome, marcaTxt, quem) => `Olhei ${artigo(nome)} ${nome}${marcaTxt} aqui e lembrei de ${quem} na hora.` },
  { verbo: 'chegou', fn: (nome, marcaTxt, quem) => `Chegou ${artigo(nome)} ${nome}${marcaTxt} que tem tudo a ver com ${quem}.` },
]

const PERGUNTAS = [
  'Quer que eu te mande as fotos?',
  'Posso te mandar foto?',
  'Passa pra ver ou prefere que eu mande foto?',
  'Bora dar uma olhada?',
  'Te mando foto pra você ver?',
]

export function construirCopyOportunidade(o: Oportunidade, nomeAmigavel?: string): OportunidadeFeed {
  const primeiro = o.clienteNome.split(' ')[0]
  const nomeBase = nomeAmigavel || limparNomeProduto(o.produtoNome, o.marca)
  const nomeLimpo = semMarcaRepetida(nomeBase, o.marca)
  const marcaTxt = o.marca ? ` da ${o.marca}` : ''

  const reativ = o.tipo === 'reativacao'
  const presente = o.tipo === 'presente'
  const quem = presente ? (REL_PRESENTE[o.compraPara ?? 'presente'] ?? REL_PRESENTE.presente) : ''

  // presente com data conhecida (Natal, Black Friday...) no motivo -- entra
  // na abertura em vez de um "oi" genérico, ex.: "a Black Friday tá chegando"
  const dataMatch = presente ? o.motivo.match(/·\s*(.+?)\s+em\s+\d+\s+dias?$/) : null
  const dataNome = dataMatch?.[1] ?? null
  const dataArt = dataNome ? `${ARTIGO_DATA[dataNome] ?? 'o'} ${dataNome}` : null

  let abertura: string, aberturaVerbo: string
  if (presente && dataArt) {
    const t = sorteiaTemplate(ABERTURAS_PRESENTE_DATA)
    abertura = t.fn(primeiro, dataArt); aberturaVerbo = t.verbo
  } else if (presente) {
    const t = sorteiaTemplate(ABERTURAS_PRESENTE)
    abertura = t.fn(primeiro); aberturaVerbo = t.verbo
  } else if (reativ) {
    const t = sorteiaTemplate(ABERTURAS_REATIVACAO)
    abertura = t.fn(primeiro); aberturaVerbo = t.verbo
  } else {
    const t = sorteiaTemplate(ABERTURAS)
    abertura = t.fn(primeiro); aberturaVerbo = t.verbo
  }

  const ofertaTpl = presente ? sorteiaTemplate(OFERTAS_PRESENTE, aberturaVerbo)
    : reativ ? sorteiaTemplate(OFERTAS_REATIVACAO, aberturaVerbo) : sorteiaTemplate(OFERTAS, aberturaVerbo)
  const oferta = presente ? ofertaTpl.fn(nomeLimpo, marcaTxt, quem) : ofertaTpl.fn(nomeLimpo, marcaTxt, o.tamanho)

  const pergunta = sorteiaSimples(PERGUNTAS)

  return {
    clienteId: o.clienteId, clienteNome: o.clienteNome, telefone: o.telefone,
    produtoNome: nomeLimpo, marca: o.marca, tamanho: o.tamanho, motivo: o.motivo, tipo: o.tipo,
    copy: `${abertura} ${oferta} ${pergunta}`,
  }
}

export function construirCopyOportunidades(lista: Oportunidade[]): OportunidadeFeed[] {
  return lista.map(o => construirCopyOportunidade(o))
}

/* Versão com nome amigável (IA) — gera/lê o nome_amigavel de cada produto
   envolvido (uma vez só, cacheado em estoque.nome_amigavel) antes de montar
   a copy. Se a geração falhar pra algum item, cai no limparNomeProduto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirCopyOportunidadesComIA(admin: any, lista: Oportunidade[]): Promise<OportunidadeFeed[]> {
  if (!lista.length) return []
  const produtos = lista.map(o => ({ id: o.produtoId, nome: o.produtoNome, marca: o.marca }))
  const nomesAmigaveis = await garantirNomesAmigaveis(admin, produtos).catch(() => new Map<string, string>())
  return lista.map(o => construirCopyOportunidade(o, nomesAmigaveis.get(o.produtoId)))
}
