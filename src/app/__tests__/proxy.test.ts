import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { proxy } from '@/proxy'

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: (request: NextRequest) =>
    request.cookies.get('better-auth.session_token')?.value ?? null
}))

function req(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  return new NextRequest(`http://localhost:3000${path}`, init)
}

describe('proxy', () => {
  it('refuses a cross-site write to the API with a 403', async () => {
    const response = proxy(
      req('/api/equipment', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site'
        }
      })
    )
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('FORBIDDEN')
  })

  it('passes same-origin writes and all reads to the route', () => {
    const write = proxy(
      req('/api/equipment', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          'sec-fetch-site': 'same-origin'
        }
      })
    )
    expect(write.headers.get('x-middleware-next')).toBe('1')
    const read = proxy(
      req('/api/equipment', { headers: { 'sec-fetch-site': 'cross-site' } })
    )
    expect(read.headers.get('x-middleware-next')).toBe('1')
  })

  it('never redirects API calls to sign-in (routes answer 401 themselves)', () => {
    const response = proxy(req('/api/equipment'))
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects a signed-out page visit to sign-in with the callback', () => {
    const response = proxy(req('/inventory/abc?x=1'))
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/auth/sign-in')
    expect(location.searchParams.get('callbackUrl')).toBe('/inventory/abc')
  })

  it('lets a page visit with a session cookie through', () => {
    const response = proxy(
      req('/dashboard', {
        headers: { cookie: 'better-auth.session_token=t' }
      })
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
