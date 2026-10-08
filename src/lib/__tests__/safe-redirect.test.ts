import { describe, expect, it } from 'vitest'

import { safeCallbackUrl } from '@/lib/safe-redirect'

describe('safeCallbackUrl', () => {
  it('allows relative paths', () => {
    expect(safeCallbackUrl('/studios/abc?tab=rooms')).toBe(
      '/studios/abc?tab=rooms'
    )
  })

  it('falls back for missing values', () => {
    expect(safeCallbackUrl(null)).toBe('/dashboard')
    expect(safeCallbackUrl('', '/x')).toBe('/x')
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)'
  ])('rejects %s', (value) => {
    expect(safeCallbackUrl(value)).toBe('/dashboard')
  })
})
