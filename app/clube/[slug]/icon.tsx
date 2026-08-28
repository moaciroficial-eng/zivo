import { ImageResponse } from 'next/og'
import { createClient as createAdmin } from '@supabase/supabase-js'

/* Favicon do clube = logo da loja (sobrescreve o ícone global do app,
   porque este arquivo está numa rota mais específica). */
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default async function Icon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let logo: string | null = null
  let nome = 'C'
  try {
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await admin.from('loja_config').select('logo_url, nome_loja').eq('clube_slug', slug).maybeSingle()
    logo = (data?.logo_url as string | null) ?? null
    nome = ((data?.nome_loja as string | null) ?? 'C').trim().charAt(0).toUpperCase() || 'C'
  } catch { /* usa fallback */ }

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {logo
          ? <img src={logo} width={64} height={64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ color: '#fff', fontSize: 42, fontWeight: 700 }}>{nome}</div>}
      </div>
    ),
    size
  )
}
