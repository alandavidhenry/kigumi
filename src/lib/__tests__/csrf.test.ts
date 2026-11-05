import { describe, expect, it } from 'vitest'

import { isCrossSiteMutation } from '@/lib/csrf'

const base = {
  method: 'POST',
  origin: 'https://app.kigumi.io',
  secFetchSite: 'same-origin',
  host: 'app.kigumi.io',
  appUrl: 'https://app.kigumi.io'
}

describe('isCrossSiteMutation', () => {
  it('lets same-origin browser writes through', () => {
    expect(isCrossSiteMutation(base)).toBe(false)
  })

  it('never blocks safe methods, even cross-site', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(
        isCrossSiteMutation({
          ...base,
          method,
          origin: 'https://evil.example',
          secFetchSite: 'cross-site'
        })
      ).toBe(false)
    }
  })

  it('blocks cross-site and same-site (sibling subdomain) writes', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(
        isCrossSiteMutation({ ...base, method, secFetchSite: 'cross-site' })
      ).toBe(true)
    }
    expect(isCrossSiteMutation({ ...base, secFetchSite: 'same-site' })).toBe(
      true
    )
  })

  it('falls back to Origin when there is no fetch metadata', () => {
    const noMeta = { ...base, secFetchSite: null }
    expect(isCrossSiteMutation(noMeta)).toBe(false)
    expect(
      isCrossSiteMutation({ ...noMeta, origin: 'https://evil.example' })
    ).toBe(true)
    expect(
      isCrossSiteMutation({ ...noMeta, origin: 'https://files.kigumi.io' })
    ).toBe(true)
    expect(isCrossSiteMutation({ ...noMeta, origin: 'null' })).toBe(true)
    expect(isCrossSiteMutation({ ...noMeta, origin: 'not a url' })).toBe(true)
  })

  it('accepts the request Host or the configured app URL', () => {
    // Behind a proxy that rewrites Host, the public URL still matches.
    expect(
      isCrossSiteMutation({
        ...base,
        secFetchSite: null,
        host: 'internal:8080'
      })
    ).toBe(false)
    // Local development without BETTER_AUTH_URL.
    expect(
      isCrossSiteMutation({
        ...base,
        secFetchSite: null,
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        appUrl: undefined
      })
    ).toBe(false)
  })

  it('lets non-browser clients through to the normal auth checks', () => {
    expect(
      isCrossSiteMutation({ ...base, origin: null, secFetchSite: null })
    ).toBe(false)
  })

  it('treats a user-initiated request as same-origin', () => {
    expect(isCrossSiteMutation({ ...base, secFetchSite: 'none' })).toBe(false)
  })
})
