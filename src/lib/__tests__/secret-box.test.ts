import { afterEach, describe, expect, it, vi } from 'vitest'

import { hashToken, openToken, sealToken } from '@/lib/secret-box'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hashToken', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('sealToken / openToken', () => {
  it('round-trips, and never contains the token', () => {
    const sealed = sealToken('my-token', 'p')
    expect(sealed).not.toContain('my-token')
    expect(openToken(sealed, 'p')).toBe('my-token')
  })

  it('uses a fresh IV each time', () => {
    expect(sealToken('t', 'p')).not.toBe(sealToken('t', 'p'))
  })

  it('will not open under another purpose or secret, or once tampered with', () => {
    const sealed = sealToken('my-token', 'p')
    expect(openToken(sealed, 'other')).toBeNull()

    const raw = Buffer.from(sealed, 'base64url')
    raw[raw.length - 1] ^= 1
    expect(openToken(raw.toString('base64url'), 'p')).toBeNull()
    expect(openToken('short', 'p')).toBeNull()

    vi.stubEnv('BETTER_AUTH_SECRET', 'a-rotated-secret')
    expect(openToken(sealed, 'p')).toBeNull()
  })

  it('refuses to seal without a secret', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    expect(() => sealToken('t', 'p')).toThrow(/BETTER_AUTH_SECRET/)
  })
})
