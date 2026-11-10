import type { Oportunidade } from '@/lib/inteligencia/oportunidades'
import { limparNomeProduto } from '@/lib/inteligencia/oportunidades'

/* ══════════════════════════════════════════════════════════════
   COPY DAS OPORTUNIDADES — gera a mensagem pronta (editável) a partir
   de uma Oportunidade do motor. Usado tanto no feed de /ia quanto no
   bloco "Quem chamar hoje" do Painel — um só lugar, mesmo texto.
   ══════════════════════════════════════════════════════════════ */

export type OportunidadeFeed = {
  clienteId: string; clienteNome: string; telefone: string | null
  produtoNome: string; marca: string | null; tamanho: string; motivo: string; tipo: string; copy: string
}

function saudacaoBR(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function construirCopyOportunidade(o: Oportunidade): OportunidadeFeed {
  const saud = saudacaoBR()
  const primeiro = o.clienteNome.split(' ')[0]
  const nomeLimpo = limparNomeProduto(o.produtoNome, o.marca)
  const marcaTxt = o.marca ? ` da ${o.marca}` : ''
  return {
    clienteId: o.clienteId, clienteNome: o.clienteNome, telefone: o.telefone,
    produtoNome: nomeLimpo, marca: o.marca, tamanho: o.tamanho, motivo: o.motivo, tipo: o.tipo,
    copy: `${saud} ${primeiro}! Chegou ${nomeLimpo}${marcaTxt} aqui na loja no ${o.tamanho} e achei muito a sua cara. Passa pra ver ou me fala que te mando as fotos!`,
  }
}

export function construirCopyOportunidades(lista: Oportunidade[]): OportunidadeFeed[] {
  return lista.map(construirCopyOportunidade)
}
