import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import EstoqueFormPage from '../_components/EstoqueFormPage'
import ClearScanCookie from '../_components/ClearScanCookie'
import type { ScanData } from '../actions'

export default async function NovoEstoquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const cookieStore = await cookies()
  const raw = cookieStore.get('scan_result')?.value
  const scanData: ScanData | null = raw ? JSON.parse(raw) : null

  return (
    <>
    {raw && <ClearScanCookie />}
    <EstoqueFormPage
      user={{ id: user.id, email: user.email ?? '' }}
      scanParams={scanData ? {
        nome:           scanData.nome           ?? undefined,
        marca:          scanData.marca          ?? undefined,
        categoria:      scanData.categoria      ?? undefined,
        tamanho:        scanData.tamanho        ?? undefined,
        preco_venda:    scanData.preco_venda    != null ? String(scanData.preco_venda)    : undefined,
        preco_custo:    scanData.preco_custo    != null ? String(scanData.preco_custo)    : undefined,
        codigo_produto: scanData.codigo_produto != null ? String(scanData.codigo_produto) : undefined,
        cor:            scanData.cor            ?? undefined,
      } : undefined}
    />
    </>
  )
}
