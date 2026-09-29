import { Fraunces } from 'next/font/google'

/* Wordmark do Terny — Direção "Fio de Ouro": serifa elegante (Fraunces)
   com o "y" em dourado (fio/alfaiataria). Use className pra tamanho/cor do
   "tern"; o "y" já vem dourado. */
const fraunces = Fraunces({ subsets: ['latin'], weight: ['600'] })

export function Wordmark({ className = '', accent = '#C79A54' }: { className?: string; accent?: string }) {
  return (
    <span className={`${fraunces.className} font-semibold tracking-tight ${className}`}>
      tern<span style={{ color: accent }}>y</span>
    </span>
  )
}
