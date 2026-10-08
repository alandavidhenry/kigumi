import { describe, expect, it } from 'vitest'

import { slugify, uniqueSlug } from '@/lib/slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Abbey Road Studios')).toBe('abbey-road-studios')
  })

  it('strips accents and punctuation', () => {
    expect(slugify('  Café — Sörensen & Co!  ')).toBe('cafe-sorensen-co')
  })

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(39) + ' bbbbbb')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('appends a four-character suffix', () => {
    expect(uniqueSlug('Abbey Road', () => 0)).toBe('abbey-road-0000')
    expect(uniqueSlug('Abbey Road', () => 0.5)).toMatch(
      /^abbey-road-[a-z0-9]{4}$/
    )
  })

  it('falls back when the name has no usable characters', () => {
    expect(uniqueSlug('!!!', () => 0)).toBe('studio-0000')
  })
})
