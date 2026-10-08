import { describe, expect, it } from 'vitest'

import {
  FEATURE_LABELS,
  FEATURE_MINIMUM_TIER,
  Feature,
  PLAN_INFO,
  PLAN_LIMITS,
  PLAN_ORDER,
  PlanTier,
  canAdd,
  featuresFor,
  featuresIntroducedBy,
  formatLimit,
  formatPrice,
  formatStorage,
  getPlanLimits,
  hasFeature,
  minimumTierFor,
  toPlanTier,
  upgradeTierFor
} from '@/lib/plans'

describe('toPlanTier', () => {
  it('accepts known tiers', () => {
    expect(toPlanTier('pro')).toBe(PlanTier.PRO)
    expect(toPlanTier('facility')).toBe(PlanTier.FACILITY)
  })

  it('falls back to free for anything else, including retired tiers', () => {
    expect(toPlanTier('education')).toBe(PlanTier.FREE)
    expect(toPlanTier(null)).toBe(PlanTier.FREE)
    expect(toPlanTier(undefined)).toBe(PlanTier.FREE)
  })
})

describe('getPlanLimits', () => {
  it('matches the documented free tier', () => {
    expect(getPlanLimits('free')).toEqual({
      studios: 1,
      rooms: 2,
      seats: 1,
      inventoryItems: 250,
      aiRequestsPerMonth: 25,
      storageMb: 250
    })
  })

  it('gives unknown tiers the free limits', () => {
    expect(getPlanLimits('nope')).toBe(PLAN_LIMITS[PlanTier.FREE])
  })

  it('never lowers a limit on a more expensive tier', () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lower = PLAN_LIMITS[PLAN_ORDER[i - 1]]
      const higher = PLAN_LIMITS[PLAN_ORDER[i]]
      for (const key of Object.keys(lower) as (keyof typeof lower)[]) {
        expect(higher[key]).toBeGreaterThanOrEqual(lower[key])
      }
    }
  })
})

describe('canAdd', () => {
  it('allows adding up to the limit', () => {
    expect(canAdd('free', 'studios', 0)).toBe(true)
    expect(canAdd('free', 'studios', 1)).toBe(false)
    expect(canAdd('free', 'rooms', 1)).toBe(true)
    expect(canAdd('free', 'rooms', 2)).toBe(false)
    expect(canAdd('pro', 'rooms', 3)).toBe(true)
    expect(canAdd('pro', 'rooms', 4)).toBe(false)
  })

  it('treats unlimited as unlimited', () => {
    expect(canAdd('facility', 'rooms', 10_000)).toBe(true)
    expect(canAdd('pro', 'inventoryItems', 1_000_000)).toBe(true)
  })
})

describe('upgradeTierFor', () => {
  it('names the cheapest tier that lifts the limit', () => {
    expect(upgradeTierFor('free', 'seats', 1)).toBe(PlanTier.PRO)
    expect(upgradeTierFor('free', 'studios', 1)).toBe(PlanTier.STUDIO)
    expect(upgradeTierFor('pro', 'rooms', 4)).toBe(PlanTier.STUDIO)
    expect(upgradeTierFor('studio', 'studios', 2)).toBe(PlanTier.FACILITY)
  })

  it('returns null when no plan allows more', () => {
    expect(upgradeTierFor('facility', 'seats', 50)).toBeNull()
    expect(upgradeTierFor('studio', 'seats', 1_000)).toBeNull()
  })
})

describe('features', () => {
  it('gives free no paid features', () => {
    expect(featuresFor('free')).toEqual([])
  })

  it('includes a feature from its minimum tier upwards', () => {
    expect(hasFeature('free', Feature.VALUATION_REPORT)).toBe(false)
    expect(hasFeature('pro', Feature.VALUATION_REPORT)).toBe(true)
    expect(hasFeature('studio', Feature.VALUATION_REPORT)).toBe(true)
    expect(hasFeature('facility', Feature.VALUATION_REPORT)).toBe(true)

    expect(hasFeature('pro', Feature.AUDIT_LOG)).toBe(false)
    expect(hasFeature('studio', Feature.AUDIT_LOG)).toBe(true)

    expect(hasFeature('studio', Feature.SSO)).toBe(false)
    expect(hasFeature('facility', Feature.SSO)).toBe(true)
  })

  it('treats unknown tiers as free', () => {
    expect(hasFeature('gold', Feature.EMAIL_REMINDERS)).toBe(false)
  })

  it('gives each higher tier a superset of the one below', () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lower = featuresFor(PLAN_ORDER[i - 1])
      const higher = featuresFor(PLAN_ORDER[i])
      expect(higher).toEqual(expect.arrayContaining(lower))
      expect(higher.length).toBeGreaterThan(lower.length)
    }
  })

  it('reports the cheapest tier for a feature', () => {
    expect(minimumTierFor(Feature.EMAIL_REMINDERS)).toBe(PlanTier.PRO)
    expect(minimumTierFor(Feature.AUDIT_LOG)).toBe(PlanTier.STUDIO)
    expect(minimumTierFor(Feature.EDUCATION_COHORTS)).toBe(PlanTier.FACILITY)
  })

  it('lists what each tier introduces', () => {
    expect(featuresIntroducedBy(PlanTier.FREE)).toEqual([])
    expect(featuresIntroducedBy(PlanTier.PRO)).toContain(
      Feature.VALUATION_REPORT
    )
    expect(featuresIntroducedBy(PlanTier.STUDIO)).toContain(Feature.AUDIT_LOG)
    const all = PLAN_ORDER.flatMap(featuresIntroducedBy)
    expect(all.sort()).toEqual(Object.values(Feature).sort())
  })

  it('labels every feature and never gates on free', () => {
    for (const feature of Object.values(Feature)) {
      expect(FEATURE_LABELS[feature]).toBeTruthy()
      expect(FEATURE_MINIMUM_TIER[feature]).not.toBe(PlanTier.FREE)
    }
  })
})

describe('plan info', () => {
  it('prices tiers in ascending order with annual cheaper than 12 months', () => {
    expect(PLAN_INFO[PlanTier.FREE].monthlyPricePence).toBe(0)
    for (const tier of [PlanTier.PRO, PlanTier.STUDIO]) {
      const { monthlyPricePence, annualPricePence } = PLAN_INFO[tier]
      expect(annualPricePence!).toBeLessThan(monthlyPricePence! * 12)
    }
    expect(PLAN_INFO[PlanTier.FACILITY].annualPricePence).toBeNull()
  })
})

describe('formatting', () => {
  it('formats limits', () => {
    expect(formatLimit(5)).toBe('5')
    expect(formatLimit(2500)).toBe('2,500')
    expect(formatLimit(Number.POSITIVE_INFINITY)).toBe('Unlimited')
  })

  it('formats storage', () => {
    expect(formatStorage(250)).toBe('250 MB')
    expect(formatStorage(5120)).toBe('5 GB')
    expect(formatStorage(Number.POSITIVE_INFINITY)).toBe('Unlimited')
  })

  it('formats prices', () => {
    expect(formatPrice(0)).toBe('£0')
    expect(formatPrice(1000)).toBe('£10')
    expect(formatPrice(999)).toBe('£9.99')
    expect(formatPrice(null)).toBe('Custom')
  })
})
