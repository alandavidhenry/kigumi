// Plan tiers, limits and feature entitlements (docs/PLAN.md §6, ADR 0011).
// No billing yet — limits are enforced on create and features are checked
// with hasFeature/requireFeature, so Stripe can be added later without new
// checks scattered through the code.

export enum PlanTier {
  FREE = 'free',
  PRO = 'pro',
  STUDIO = 'studio',
  FACILITY = 'facility'
}

// Ordered cheapest → most expensive; used to work out the minimum tier for a
// feature and for upgrade prompts.
export const PLAN_ORDER: readonly PlanTier[] = [
  PlanTier.FREE,
  PlanTier.PRO,
  PlanTier.STUDIO,
  PlanTier.FACILITY
]

export interface PlanLimits {
  studios: number
  rooms: number
  seats: number
  inventoryItems: number
  aiRequestsPerMonth: number
  storageMb: number
}

export type LimitedResource = keyof PlanLimits

const UNLIMITED = Number.POSITIVE_INFINITY

// Facility limits are defaults for a negotiated plan; per-organisation
// overrides arrive with billing.
export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  [PlanTier.FREE]: {
    studios: 1,
    rooms: 2,
    seats: 1,
    inventoryItems: 250,
    aiRequestsPerMonth: 25,
    storageMb: 250
  },
  [PlanTier.PRO]: {
    studios: 1,
    rooms: 4,
    seats: 3,
    inventoryItems: UNLIMITED,
    aiRequestsPerMonth: 400,
    storageMb: 5 * 1024
  },
  [PlanTier.STUDIO]: {
    studios: 2,
    rooms: 15,
    seats: 15,
    inventoryItems: UNLIMITED,
    aiRequestsPerMonth: 2500,
    storageMb: 50 * 1024
  },
  [PlanTier.FACILITY]: {
    studios: UNLIMITED,
    rooms: UNLIMITED,
    seats: 50,
    inventoryItems: UNLIMITED,
    aiRequestsPerMonth: 10_000,
    storageMb: 200 * 1024
  }
}

// Paid features. Anything not listed here (inventory, catalogue, mic locker,
// layouts, sessions, input lists, recall sheets, safety warnings, CSV
// import/export, QR labels, branded share links) is available on every tier.
export enum Feature {
  // Pro — the upgrade hooks for one-person studios
  VALUATION_REPORT = 'valuation-report',
  EMAIL_REMINDERS = 'email-reminders',
  UNBRANDED_EXPORTS = 'unbranded-exports',
  TEMPLATES = 'templates',
  AI_RECEIPT_SCAN = 'ai-receipt-scan',

  // Studio — teams and commercial operations
  AUDIT_LOG = 'audit-log',
  USAGE_HOUR_MAINTENANCE = 'usage-hour-maintenance',
  PAT_TESTING = 'pat-testing',
  SHARED_CONSOLE_TEMPLATES = 'shared-console-templates',
  BULK_IMPORT = 'bulk-import',
  BOOKING_CALENDAR = 'booking-calendar',

  // Facility — multi-site, education and enterprise
  MULTI_SITE_REPORTING = 'multi-site-reporting',
  SSO = 'sso',
  EDUCATION_COHORTS = 'education-cohorts',
  INVOICE_BILLING = 'invoice-billing',
  PRIORITY_SUPPORT = 'priority-support'
}

// The cheapest tier that includes each feature; every higher tier inherits it.
export const FEATURE_MINIMUM_TIER: Readonly<Record<Feature, PlanTier>> = {
  [Feature.VALUATION_REPORT]: PlanTier.PRO,
  [Feature.EMAIL_REMINDERS]: PlanTier.PRO,
  [Feature.UNBRANDED_EXPORTS]: PlanTier.PRO,
  [Feature.TEMPLATES]: PlanTier.PRO,
  [Feature.AI_RECEIPT_SCAN]: PlanTier.PRO,

  [Feature.AUDIT_LOG]: PlanTier.STUDIO,
  [Feature.USAGE_HOUR_MAINTENANCE]: PlanTier.STUDIO,
  [Feature.PAT_TESTING]: PlanTier.STUDIO,
  [Feature.SHARED_CONSOLE_TEMPLATES]: PlanTier.STUDIO,
  [Feature.BULK_IMPORT]: PlanTier.STUDIO,
  [Feature.BOOKING_CALENDAR]: PlanTier.STUDIO,

  [Feature.MULTI_SITE_REPORTING]: PlanTier.FACILITY,
  [Feature.SSO]: PlanTier.FACILITY,
  [Feature.EDUCATION_COHORTS]: PlanTier.FACILITY,
  [Feature.INVOICE_BILLING]: PlanTier.FACILITY,
  [Feature.PRIORITY_SUPPORT]: PlanTier.FACILITY
}

export const FEATURE_LABELS: Readonly<Record<Feature, string>> = {
  [Feature.VALUATION_REPORT]: 'Insurance & valuation report',
  [Feature.EMAIL_REMINDERS]: 'Email reminders',
  [Feature.UNBRANDED_EXPORTS]: 'Unbranded PDFs & share links',
  [Feature.TEMPLATES]: 'Layout & session templates',
  [Feature.AI_RECEIPT_SCAN]: 'AI receipt scanning',
  [Feature.AUDIT_LOG]: 'Activity log',
  [Feature.USAGE_HOUR_MAINTENANCE]: 'Usage-hour maintenance',
  [Feature.PAT_TESTING]: 'PAT testing register',
  [Feature.SHARED_CONSOLE_TEMPLATES]: 'Shared console templates',
  [Feature.BULK_IMPORT]: 'Bulk import',
  [Feature.BOOKING_CALENDAR]: 'Booking calendar',
  [Feature.MULTI_SITE_REPORTING]: 'Multi-site reporting',
  [Feature.SSO]: 'Single sign-on',
  [Feature.EDUCATION_COHORTS]: 'Class & cohort accounts',
  [Feature.INVOICE_BILLING]: 'Annual invoicing',
  [Feature.PRIORITY_SUPPORT]: 'Priority support'
}

export interface PlanInfo {
  label: string
  audience: string
  // Prices in pence (GBP). null = custom / contact us.
  monthlyPricePence: number | null
  annualPricePence: number | null
}

// Starting prices to validate with customers (ADR 0011); not yet charged.
export const PLAN_INFO: Readonly<Record<PlanTier, PlanInfo>> = {
  [PlanTier.FREE]: {
    label: 'Free',
    audience: 'Home and bedroom studios',
    monthlyPricePence: 0,
    annualPricePence: 0
  },
  [PlanTier.PRO]: {
    label: 'Pro',
    audience: 'Solo pros and project studios',
    monthlyPricePence: 1000,
    annualPricePence: 9600
  },
  [PlanTier.STUDIO]: {
    label: 'Studio',
    audience: 'Commercial studios with staff',
    monthlyPricePence: 3500,
    annualPricePence: 33600
  },
  [PlanTier.FACILITY]: {
    label: 'Facility',
    audience: 'Multi-site studios and education',
    monthlyPricePence: 9000,
    annualPricePence: null
  }
}

export const PLAN_LABELS: Readonly<Record<PlanTier, string>> = {
  [PlanTier.FREE]: PLAN_INFO[PlanTier.FREE].label,
  [PlanTier.PRO]: PLAN_INFO[PlanTier.PRO].label,
  [PlanTier.STUDIO]: PLAN_INFO[PlanTier.STUDIO].label,
  [PlanTier.FACILITY]: PLAN_INFO[PlanTier.FACILITY].label
}

export function toPlanTier(value: unknown): PlanTier {
  return PLAN_ORDER.includes(value as PlanTier)
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

// The cheapest tier above `tier` that would allow one more of `resource`,
// or null when no plan does (for "Upgrade to X" prompts).
export function upgradeTierFor(
  tier: unknown,
  resource: LimitedResource,
  currentCount: number
): PlanTier | null {
  const above = PLAN_ORDER.slice(tierRank(tier) + 1)
  return above.find((next) => canAdd(next, resource, currentCount)) ?? null
}

function tierRank(tier: unknown): number {
  return PLAN_ORDER.indexOf(toPlanTier(tier))
}

export function hasFeature(tier: unknown, feature: Feature): boolean {
  return tierRank(tier) >= tierRank(FEATURE_MINIMUM_TIER[feature])
}

export function minimumTierFor(feature: Feature): PlanTier {
  return FEATURE_MINIMUM_TIER[feature]
}

// Features a tier adds on top of the tier below it (for plan comparisons).
export function featuresIntroducedBy(tier: PlanTier): Feature[] {
  return (Object.keys(FEATURE_MINIMUM_TIER) as Feature[]).filter(
    (feature) => FEATURE_MINIMUM_TIER[feature] === tier
  )
}

export function featuresFor(tier: unknown): Feature[] {
  return (Object.keys(FEATURE_MINIMUM_TIER) as Feature[]).filter((feature) =>
    hasFeature(tier, feature)
  )
}

export function formatLimit(limit: number): string {
  return Number.isFinite(limit) ? limit.toLocaleString('en-GB') : 'Unlimited'
}

export function formatStorage(megabytes: number): string {
  if (!Number.isFinite(megabytes)) return 'Unlimited'
  return megabytes >= 1024
    ? `${(megabytes / 1024).toLocaleString('en-GB')} GB`
    : `${megabytes} MB`
}

export function formatPrice(pence: number | null): string {
  if (pence === null) return 'Custom'
  if (pence === 0) return '£0'
  const pounds = pence / 100
  return `£${Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`
}
