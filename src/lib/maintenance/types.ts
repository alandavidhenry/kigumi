// Vocabulary and limits for maintenance, PAT testing and warranties
// (PLAN §4.8 and §4.9, ADR 0018). Stored as plain strings; this is the
// source of truth.

export const PAT_RESULTS = ['pass', 'fail'] as const
export type PatResult = (typeof PAT_RESULTS)[number]
export const PAT_RESULT_LABELS: Readonly<Record<PatResult, string>> = {
  pass: 'Pass',
  fail: 'Fail'
}

export const PAT_TEST_TYPES = ['visual', 'combined'] as const
export type PatTestType = (typeof PAT_TEST_TYPES)[number]
export const PAT_TEST_TYPE_LABELS: Readonly<Record<PatTestType, string>> = {
  visual: 'Visual inspection',
  combined: 'Combined inspection and test'
}

// UK guidance sets no legal interval: it depends on the equipment and where it
// is used. 12 months is a common default for studio kit, so it is only a
// default; the choices below are what the form offers.
export const PAT_INTERVAL_MONTHS = [3, 6, 12, 24, 48] as const
export const DEFAULT_PAT_INTERVAL_MONTHS = 12
export const PAT_LEAD_DAYS = 30

export const DEFAULT_PLAN_LEAD_DAYS = 14
export const DEFAULT_WARRANTY_LEAD_DAYS = 30
export const MAX_LEAD_DAYS = 365

// A usage-hours task is "due soon" once this share of its interval is left.
export const HOURS_DUE_SOON_FRACTION = 0.1

export const MAX_FILES_PER_RECORD = 6
export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
] as const

export const NOTIFICATION_KINDS = [
  'maintenance_due',
  'maintenance_overdue',
  'pat_due',
  'pat_overdue',
  'pat_failed',
  'warranty_expiring',
  'warranty_expired'
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export type DueState = 'ok' | 'due_soon' | 'overdue'
