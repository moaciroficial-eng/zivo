import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = [
  '/dashboard', '/clientes', '/vendas', '/calendario', '/estoque',
  '/compras', '/whatsapp', '/configuracoes', '/agentes', '/inteligencia',
  '/ia', '/biblioteca', '/onboarding', '/campanhas', '/caixa',
]
const publicRoutes = ['/']

/* Resolve o slug do clube por domínio próprio (ex: clubemoca.com.br → loja).
   Cache em memória (5 min) pra não bater no banco a cada request. */
const clubeCache = new Map<string, { slug: string | null; exp: number }>()
async function resolverClubeSlug(host: string): Promise<string | null> {
  const c = clubeCache.get(host)
  if (c && c.exp > Date.now()) return c.slug
  let slug: string | null = null
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/loja_config?clube_dominio=eq.${encodeURIComponent(host)}&clube_ativo=eq.true&select=clube_slug&limit=1`
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      cache: 'no-store',
    })
    if (res.ok) {
      const rows = await res.json()
      slug = rows?.[0]?.clube_slug ?? null
    }
  } catch { /* ignora — trata como domínio normal */ }
  clubeCache.set(host, { slug, exp: Date.now() + 5 * 60_000 })
  return slug
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()

  /* ── Domínio próprio de clube (clubemoca.com.br) → serve o clube da loja ──
     Qualquer host que não seja o app (vercel.app/localhost) é candidato. */
  const ehDominioApp = host.endsWith('vercel.app') || host.includes('localhost') || host.startsWith('127.')
  if (!ehDominioApp && host) {
    const slug = await resolverClubeSlug(host)
    if (slug) {
      if (path === '/') {
        const url = req.nextUrl.clone()
        url.pathname = `/clube/${slug}`
        return NextResponse.rewrite(url)
      }
      /* /clube/*, /api/clube/* e estáticos já servem no mesmo host — segue */
      return NextResponse.next()
    }
  }

  const isProtectedRoute = protectedRoutes.some((r) => path.startsWith(r))
  const isPublicRoute = publicRoutes.includes(path)

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }

  if (isPublicRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
