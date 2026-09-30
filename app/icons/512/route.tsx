import { ImageResponse } from 'next/og'
import { TernIcon } from '@/lib/pwa-icon'

/* Ícone 512x512 do manifesto (PWA). */
export function GET() {
  return new ImageResponse(<TernIcon />, { width: 512, height: 512 })
}
