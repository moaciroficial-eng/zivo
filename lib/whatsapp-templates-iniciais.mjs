// Pacote inicial de templates da WABA-fonte (Terny) -- fonte única usada
// tanto pelo script de terminal (scripts/whatsapp-templates.mjs) quanto
// pela tela WhatsApp -> Templates, pra nunca ficarem dessincronizados.

export const RODAPE_TEMPLATES = 'Moca · Roda Velha'

export const BOTOES_PADRAO = [
  { type: 'QUICK_REPLY', text: 'Quero ver' },
  { type: 'QUICK_REPLY', text: 'Não quero receber' },
]
export const BOTOES_VIP = [
  { type: 'QUICK_REPLY', text: 'EU QUERO' },
  { type: 'QUICK_REPLY', text: 'Não quero receber' },
]

function tpl(name, bodyText, exemplos, botoes) {
  return {
    name,
    language: 'pt_BR',
    category: 'MARKETING',
    components: [
      { type: 'BODY', text: bodyText, example: { body_text: [exemplos] } },
      { type: 'FOOTER', text: RODAPE_TEMPLATES },
      { type: 'BUTTONS', buttons: botoes },
    ],
  }
}

export const TEMPLATES_INICIAIS = [
  tpl(
    'reencontro_cliente',
    'Oi, {{1}}! Faz tempo que você não aparece por aqui. Chegou {{2}} no seu tamanho {{3}} e lembrei de você na hora. Quer que eu te mande foto?',
    ['Samuel', 'uma camiseta da Aramis', 'G'],
    BOTOES_PADRAO,
  ),
  tpl(
    'novidade_cliente',
    'Oi, {{1}}! Chegou {{2}} aqui na loja e tem no seu tamanho {{3}}. Pensei em você. Quer ver as fotos?',
    ['Samuel', 'uma camiseta da Aramis', 'G'],
    BOTOES_PADRAO,
  ),
  tpl(
    'novidade_cliente_2',
    'E aí, {{1}}! Separei {{2}} no seu tamanho {{3}} que é bem a sua cara. Te mando foto?',
    ['Samuel', 'uma camiseta da Aramis', 'G'],
    BOTOES_PADRAO,
  ),
  tpl(
    'presente_data',
    'Oi, {{1}}! {{2}} tá chegando e já separei umas ideias de presente aqui na loja, tipo {{3}}. Quer que eu te mande fotos?',
    ['Andréia', 'A Black Friday', 'uma camiseta da Aramis'],
    BOTOES_PADRAO,
  ),
  tpl(
    'aniversario_cliente',
    'Feliz aniversário, {{1}}! 🎉 Muita saúde e sucesso pra você. Passa aqui na loja essa semana que tem um mimo te esperando.',
    ['Samuel'],
    BOTOES_PADRAO,
  ),
  tpl(
    'black_lista_vip',
    'Oi, {{1}}! A Black da Moca começa sábado e vai ter peça com até 70% de desconto. Quem responder EU QUERO recebe as peças e os preços um dia antes de todo mundo. Quer entrar na lista VIP?',
    ['Samuel'],
    BOTOES_VIP,
  ),
  tpl(
    'black_abertura',
    // o corpo não pode COMEÇAR com variável -- a Meta rejeita ("Invalid
    // parameter") sem texto literal antes do primeiro {{1}}
    'Oi, {{1}}! A Black da Moca começou! Tem peça com até 70% de desconto, parcelado sem juros e com condicional pra provar em casa. Quer que eu te mande as peças no seu tamanho?',
    ['Samuel'],
    BOTOES_PADRAO,
  ),
]
