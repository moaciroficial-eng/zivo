/* Email(s) do fundador do Terny — canal de administração central, separado
   da experiência de loja. Configurável por env (FOUNDER_EMAIL, vírgula pra
   vários), com fallback pro email conhecido do dono. */
export function ehFundador(email?: string | null): boolean {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return false
  const lista = (process.env.FOUNDER_EMAIL || 'moaciroficial@gmail.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return lista.includes(e)
}
