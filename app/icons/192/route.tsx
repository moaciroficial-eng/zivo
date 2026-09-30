import { ImageResponse } from 'next/og'
import { TernIcon } from '@/lib/pwa-icon'

/* Ícone 192x192 do manifesto (PWA). */
export function GET() {
  return new ImageResponse(<TernIcon />, { width: 192, height: 192 })
}
