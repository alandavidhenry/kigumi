// Plan tiers and their limits (docs/PLAN.md §6). No billing yet — these are
// enforced on create so billing can be bolted on later without new checks.

export enum PlanTier {
  FREE = 'free',
  PRO = 'pro',
  STUDIO = 'studio',
  EDUCATION = 'education'
}

export interface PlanLimits {
  studios: number
  rooms: number
  seats: number
  aiRequestsPerMonth: number
}

export type LimitedResource = keyof PlanLimits

const UNLIMITED = Number.POSITIVE_INFINITY

export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  [PlanTier.FREE]: { studios: 1, rooms: 1, seats: 2, aiRequestsPerMonth: 50 },
  [PlanTier.PRO]: {
    studios: 1,
    rooms: 5,
    seats: 5,
    aiRequestsPerMonth: 1000
  },
  [PlanTier.STUDIO]: {
    studios: 3,
    rooms: UNLIMITED,
    seats: 15,
    aiRequestsPerMonth: 5000
  },
  // Education is negotiated per customer; generous defaults until it is.
  [PlanTier.EDUCATION]: {
    studios: 10,
    rooms: UNLIMITED,
    seats: 100,
    aiRequestsPerMonth: 10000
  }
}

export const PLAN_LABELS: Readonly<Record<PlanTier, string>> = {
  [PlanTier.FREE]: 'Free',
  [PlanTier.PRO]: 'Pro',
  [PlanTier.STUDIO]: 'Studio',
  [PlanTier.EDUCATION]: 'Education'
}

export function toPlanTier(value: unknown): PlanTier {
  return Object.values(PlanTier).includes(value as PlanTier)
    ? (value as PlanTier)
    : PlanTier.FREE
}

export function getPlanLimits(tier: unknown): PlanLimits {
  return PLAN_LIMITS[toPlanTier(tier)]
}

// True when one more of `resource` would still be within the plan.
export function canAdd(
  tier: unknown,
  resource: LimitedResource,
  currentCount: number
): boolean {
  return currentCount < getPlanLimits(tier)[resource]
}

export function formatLimit(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : 'Unlimited'
}
