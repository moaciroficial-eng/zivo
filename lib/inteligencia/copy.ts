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

/* Cada função recebe o primeiro nome e devolve a 1ª frase (abertura +
   gancho). Variadas de propósito — a escolha é aleatória a cada geração. */
const ABERTURAS: ((nome: string) => string)[] = [
  (nome) => `${saudacaoBR()}, ${nome}! Chegou uma peça aqui que tem a sua cara.`,
  (nome) => `${nome}, oi! Separei uma coisa pra você.`,
  (nome) => `${saudacaoBR()}, ${nome}! Acabou de chegar uma peça e lembrei de você na hora.`,
  (nome) => `${nome}! Chegou novidade aqui na loja com a sua cara.`,
  (nome) => `Oi, ${nome}! Vi uma peça nova e pensei em você.`,
  (nome) => `${saudacaoBR()}, ${nome}, tudo bem? Chegou algo que acho que você vai curtir.`,
]

const PERGUNTAS = [
  'Quer que eu te mande as fotos?',
  'Posso te mandar foto?',
  'Passa pra ver ou prefere que eu mande foto?',
  'Bora dar uma olhada?',
  'Te mando foto pra você ver?',
]

function sorteia<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)]
}

export function construirCopyOportunidade(o: Oportunidade, nomeAmigavel?: string): OportunidadeFeed {
  const primeiro = o.clienteNome.split(' ')[0]
  const nomeBase = nomeAmigavel || limparNomeProduto(o.produtoNome, o.marca)
  const nomeLimpo = semMarcaRepetida(nomeBase, o.marca)
  const marcaTxt = o.marca ? ` da ${o.marca}` : ''

  const abertura = sorteia(ABERTURAS)(primeiro)
  const oferta = `É ${nomeLimpo}${marcaTxt}, no seu tamanho ${o.tamanho}.`
  const pergunta = sorteia(PERGUNTAS)

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
