/* Ícone do app Terny — "t" dourado no ônix (Direção Fio de Ouro).
   Usado pelas rotas que geram os PNGs do manifesto (192/512/maskable)
   e pelo apple-icon. Um só desenho, escalado por tamanho. */
export function TernIcon({ maskable = false }: { maskable?: boolean }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100">
        {/* fundo: quadrado cheio (maskable) ou squircle (comum) */}
        <rect
          x="0" y="0" width="100" height="100"
          rx={maskable ? 0 : 22}
          fill="#141317"
        />
        {/* "t" dourado */}
        <path d="M50 27 L50 73" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M32 38 L68 38" stroke="#C79A54" strokeWidth="8.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
