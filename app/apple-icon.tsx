import { ImageResponse } from 'next/og'
import { TernIcon } from '@/lib/pwa-icon'

/* Ícone da tela inicial no iPhone/iPad (apple-touch-icon). */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(<TernIcon />, { ...size })
}
