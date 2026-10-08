import { getSessionCookie } from 'better-auth/cookies'
import { NextRequest, NextResponse } from 'next/server'

// Optimistic check only: redirects requests without a session cookie to
// sign-in. It never decides access — the (app) layout and every API route
// resolve the session and organisation server-side (ADR 0002).
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/auth/sign-in'
  url.search = ''
  url.searchParams.set('callbackUrl', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/studios/:path*',
    '/settings/:path*',
    '/activity/:path*',
    '/onboarding/:path*'
  ]
}
