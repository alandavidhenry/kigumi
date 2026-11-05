import { describe, expect, it } from 'vitest'

import {
  buildCsp,
  headerRules,
  securityHeaders
} from '../../../security-headers.mjs'

const prod = { isDev: false, appUrl: 'https://app.kigumi.io' }
const local = { isDev: false, appUrl: 'http://localhost:3000' }

function header(list: { key: string; value: string }[], key: string) {
  return list.find((h) => h.key === key)?.value
}

describe('buildCsp', () => {
  it('forbids framing, plugins, base hijacking and off-site posts', () => {
    const csp = buildCsp(prod)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("default-src 'self'")
  })

  it('allows eval and the HMR socket only in development', () => {
    expect(buildCsp(prod)).not.toContain('unsafe-eval')
    expect(buildCsp(prod)).not.toContain('ws:')
    const dev = buildCsp({ isDev: true, appUrl: 'http://localhost:3000' })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).toContain("connect-src 'self' ws: wss:")
  })

  it('upgrades insecure requests only on an https origin', () => {
    expect(buildCsp(prod)).toContain('upgrade-insecure-requests')
    expect(buildCsp(local)).not.toContain('upgrade-insecure-requests')
  })
})

describe('securityHeaders', () => {
  it('sets the baseline headers everywhere', () => {
    const list = securityHeaders(local)
    expect(header(list, 'X-Frame-Options')).toBe('DENY')
    expect(header(list, 'X-Content-Type-Options')).toBe('nosniff')
    expect(header(list, 'Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(header(list, 'Permissions-Policy')).toContain('camera=()')
  })

  it('sends HSTS only over https', () => {
    expect(header(securityHeaders(prod), 'Strict-Transport-Security')).toMatch(
      /max-age=\d+/
    )
    expect(
      header(securityHeaders(local), 'Strict-Transport-Security')
    ).toBeUndefined()
  })
})

describe('headerRules', () => {
  it('keeps the page CSP off uploaded files', () => {
    const csp = headerRules(prod).find((rule) =>
      rule.headers.some((h) => h.key === 'Content-Security-Policy')
    )
    const pattern = new RegExp(`^${csp!.source}$`)
    expect(pattern.test('/dashboard')).toBe(true)
    expect(pattern.test('/api/equipment')).toBe(true)
    expect(pattern.test('/api/attachments/abc')).toBe(false)
  })
})
