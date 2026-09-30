import type { MetadataRoute } from 'next'

/* Manifesto do app Terny (PWA). Deixa a loja instalar o Terny na tela
   do celular, com ícone dourado no ônix e abrindo direto no painel.
   Os ícones são gerados nas rotas /icons/* (PNG via next/og). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Terny — sua loja no automático',
    short_name: 'Terny',
    description: 'Gerencie sua loja com inteligência: oportunidades do dia, campanhas e atendimento no WhatsApp.',
    id: '/',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0B0D',
    theme_color: '#0B0B0D',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['business', 'productivity', 'shopping'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
