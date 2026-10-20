import { afterEach, describe, expect, it, vi } from 'vitest'

import { AI_RATE_LIMIT, modelFor } from '@/lib/ai/config'
import {
  allowedNumbers,
  findUngroundedNumbers,
  groundingProblems,
  numbersIn
} from '@/lib/ai/grounding'
import { canonicalJson, hashInput } from '@/lib/ai/hash'
import { createRateLimiter } from '@/lib/ai/rate-limit'
import { AI_LIMIT_RESOURCE, monthKey } from '@/lib/ai/usage'

describe('canonicalJson / hashInput', () => {
  it('ignores key order, recursively', () => {
    const a = { b: 1, a: { y: [1, 2], x: 'z' } }
    const b = { a: { x: 'z', y: [1, 2] }, b: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
    expect(hashInput(a)).toBe(hashInput(b))
  })

  it('keeps array order and tells different values apart', () => {
    expect(hashInput({ a: [1, 2] })).not.toBe(hashInput({ a: [2, 1] }))
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }))
  })

  it('treats undefined like a missing key but null as a value', () => {
    expect(hashInput({ a: 1, b: undefined })).toBe(hashInput({ a: 1 }))
    expect(hashInput({ a: 1, b: null })).not.toBe(hashInput({ a: 1 }))
  })

  it('produces a sha256 hex digest', () => {
    expect(hashInput('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('numbersIn', () => {
  it('finds integers, decimals and thousands separators', () => {
    expect(numbersIn('40 Hz to 15,000 Hz, 1.6 mV/Pa')).toEqual([40, 15000, 1.6])
  })

  it('finds digits inside model names', () => {
    expect(numbersIn('SM57 and U 87 Ai')).toEqual([57, 87])
  })

  it('returns nothing for prose', () => {
    expect(numbersIn('A rugged dynamic cardioid.')).toEqual([])
  })
})

describe('grounding', () => {
  const input = {
    name: 'Shure SM57',
    frequencyRangeMinHz: 40,
    frequencyRangeMaxHz: 15000,
    sensitivityMvPa: 1.6,
    sensitivityDbvPa: -55.92,
    padsDb: [10, 20],
    specConditions: { maxSplDb: '@ 1% THD' }
  }

  it('allows numbers copied from the input, as numbers or in strings', () => {
    expect(
      findUngroundedNumbers(
        { text: 'The SM57 reaches 15,000 Hz at 1.6 mV/Pa with a 10 dB pad.' },
        input
      )
    ).toEqual([])
  })

  it('allows harmless restatements: kHz and rounding', () => {
    expect(
      findUngroundedNumbers(
        { text: 'Roughly 15 kHz at the top, about -56 dBV/Pa.' },
        input
      )
    ).toEqual([])
    expect(allowedNumbers(input).has(15)).toBe(true)
  })

  it('ignores the sign, so minus values match', () => {
    expect(findUngroundedNumbers('−55.92 dBV/Pa', input)).toEqual([])
  })

  it('flags numbers the model made up', () => {
    expect(
      findUngroundedNumbers(
        { a: 'Needs 48 V phantom', b: ['About 6 dB hotter', 'since 1966'] },
        input
      ).sort((x, y) => x - y)
    ).toEqual([6, 48, 1966])
  })

  it('reports each ungrounded number once, as a retry instruction', () => {
    const problems = groundingProblems({ a: '48 and 48 again' }, input)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('48')
  })

  it('finds numbers in nested output', () => {
    expect(
      findUngroundedNumbers({ x: { y: [{ z: 'seven 7' }] } }, input)
    ).toEqual([7])
  })
})

describe('createRateLimiter', () => {
  it('allows up to max hits per window per key', () => {
    const now = 0
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 1000,
      now: () => now
    })
    expect(limiter.consume('a')).toBe(0)
    expect(limiter.consume('a')).toBe(0)
    expect(limiter.consume('a')).toBeGreaterThan(0)
    // Another key has its own window.
    expect(limiter.consume('b')).toBe(0)
  })

  it('tells the caller how long to wait, rounded up', () => {
    let now = 0
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 60_000,
      now: () => now
    })
    limiter.consume('a')
    now = 10_500
    expect(limiter.consume('a')).toBe(50)
  })

  it('lets requests through again once the window has passed', () => {
    let now = 0
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 1000,
      now: () => now
    })
    limiter.consume('a')
    expect(limiter.consume('a')).toBeGreaterThan(0)
    now = 1000
    expect(limiter.consume('a')).toBe(0)
  })

  it('does not count rejected hits against the window', () => {
    let now = 0
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 1000,
      now: () => now
    })
    limiter.consume('a')
    now = 500
    limiter.consume('a')
    limiter.consume('a')
    now = 1000
    expect(limiter.consume('a')).toBe(0)
  })

  it('reset clears every window', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 })
    limiter.consume('a')
    limiter.reset()
    expect(limiter.consume('a')).toBe(0)
  })
})

describe('config', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to Sonnet 5.5 and Haiku 5.5', () => {
    vi.stubEnv('AI_MODEL_DEFAULT', '')
    vi.stubEnv('AI_MODEL_FAST', '')
    expect(modelFor('default')).toBe('claude-sonnet-5-5')
    expect(modelFor('fast')).toBe('claude-haiku-5-5')
  })

  it('reads model ids from the environment', () => {
    vi.stubEnv('AI_MODEL_DEFAULT', ' custom-model ')
    expect(modelFor('default')).toBe('custom-model')
  })

  it('has a burst limit and names the allowance resource', () => {
    expect(AI_RATE_LIMIT.max).toBeGreaterThan(0)
    expect(AI_LIMIT_RESOURCE).toBe('AI requests this month')
  })
})

describe('monthKey', () => {
  it('uses the UTC month', () => {
    expect(monthKey(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10')
    expect(monthKey(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12')
  })
})
