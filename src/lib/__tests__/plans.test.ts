import { describe, expect, it } from 'vitest'

import {
  PLAN_LIMITS,
  PlanTier,
  canAdd,
  formatLimit,
  getPlanLimits,
  toPlanTier
} from '@/lib/plans'

describe('toPlanTier', () => {
  it('accepts known tiers', () => {
    expect(toPlanTier('pro')).toBe(PlanTier.PRO)
    expect(toPlanTier('education')).toBe(PlanTier.EDUCATION)
  })

  it('falls back to free for anything else', () => {
    expect(toPlanTier('enterprise')).toBe(PlanTier.FREE)
    expect(toPlanTier(null)).toBe(PlanTier.FREE)
    expect(toPlanTier(undefined)).toBe(PlanTier.FREE)
  })
})

describe('getPlanLimits', () => {
  it('matches the documented free tier', () => {
    expect(getPlanLimits('free')).toEqual({
      studios: 1,
      rooms: 1,
      seats: 2,
      aiRequestsPerMonth: 50
    })
  })

  it('gives unknown tiers the free limits', () => {
    expect(getPlanLimits('nope')).toBe(PLAN_LIMITS[PlanTier.FREE])
  })
})

describe('canAdd', () => {
  it('allows adding up to the limit', () => {
    expect(canAdd('free', 'studios', 0)).toBe(true)
    expect(canAdd('free', 'studios', 1)).toBe(false)
    expect(canAdd('pro', 'rooms', 4)).toBe(true)
    expect(canAdd('pro', 'rooms', 5)).toBe(false)
  })

  it('treats unlimited as unlimited', () => {
    expect(canAdd('studio', 'rooms', 10_000)).toBe(true)
  })
})

describe('formatLimit', () => {
  it('formats finite and unlimited values', () => {
    expect(formatLimit(5)).toBe('5')
    expect(formatLimit(Number.POSITIVE_INFINITY)).toBe('Unlimited')
  })
})
