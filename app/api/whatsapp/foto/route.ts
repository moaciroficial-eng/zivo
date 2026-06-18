import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const INSTANCE = process.env.ZAPI_INSTANCE_ID
const TOKEN    = process.env.ZAPI_TOKEN
const BASE     = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}`

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  const contatoId = request.nextUrl.searchParams.get('contatoId')
  if (!phone || !INSTANCE || !TOKEN) return NextResponse.json({ photo: null })

  try {
    const normalized = phone.replace(/\D/g, '')
    const number = normalized.startsWith('55') ? normalized : `55${normalized}`
    const res = await fetch(`${BASE}/profile-picture?phone=${number}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ photo: null })
    const data = await res.json()
    const photo: string | null = data?.photo ?? data?.url ?? null

    // Salva no banco se tiver contatoId e foto
    if (photo && contatoId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      await supabase.from('whatsapp_contatos').update({ foto_url: photo }).eq('id', contatoId)
    }

    return NextResponse.json({ photo })
  } catch {
    return NextResponse.json({ photo: null })
  }
}
