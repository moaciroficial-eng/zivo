import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = [
  '/dashboard', '/clientes', '/vendas', '/calendario', '/estoque',
  '/compras', '/whatsapp', '/configuracoes', '/agentes', '/inteligencia',
  '/ia', '/biblioteca', '/onboarding',
]
const publicRoutes = ['/']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
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
