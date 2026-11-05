import { getSessionCookie } from 'better-auth/cookies'
import { NextRequest, NextResponse } from 'next/server'

import { isCrossSiteMutation } from '@/lib/csrf'

// Two jobs, neither of which decides access on its own:
// - /api: refuse mutating requests that a browser marks as cross-site
//   (src/lib/csrf.ts). Every route still resolves the session itself.
// - app pages: an optimistic redirect to sign-in when there is no session
//   cookie. The (app) layout and every API route resolve the session and
//   organisation server-side (ADR 0002).
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const blocked = isCrossSiteMutation({
      method: request.method,
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      host: request.headers.get('host'),
      appUrl: process.env.BETTER_AUTH_URL
    })
    if (blocked) {
      return NextResponse.json(
        { error: 'Cross-site request refused', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    return NextResponse.next()
  }

  if (getSessionCookie(request)) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/auth/sign-in'
  url.search = ''
  url.searchParams.set('callbackUrl', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/studios/:path*',
    '/inventory/:path*',
    '/consoles/:path*',
    '/settings/:path*',
    '/activity/:path*',
    '/mics/:path*',
    '/locker/:path*',
    '/recommendations/:path*',
    '/sessions/:path*',
    '/layouts/:path*',
    '/maintenance/:path*',
    '/warranties/:path*',
    '/notifications/:path*',
    '/admin/:path*',
    '/onboarding/:path*'
  ]
}
