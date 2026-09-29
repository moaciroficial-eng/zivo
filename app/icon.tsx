import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/* Ícone do Terny — "t" dourado no ônix (Direção Fio de Ouro) */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 32, height: 32, display: 'flex' }}>
        <svg width="32" height="32" viewBox="0 0 32 32">
          <rect x="0" y="0" width="32" height="32" rx="8" fill="#141317" />
          <path d="M16 9 L16 23" stroke="#C79A54" strokeWidth="2.7" strokeLinecap="round" />
          <path d="M10.5 13 L21.5 13" stroke="#C79A54" strokeWidth="2.7" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
