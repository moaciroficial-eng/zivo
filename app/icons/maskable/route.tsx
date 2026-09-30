import { ImageResponse } from 'next/og'
import { TernIcon } from '@/lib/pwa-icon'

/* Ícone 512x512 maskable — fundo cheio, "t" na zona segura (Android). */
export function GET() {
  return new ImageResponse(<TernIcon maskable />, { width: 512, height: 512 })
}
