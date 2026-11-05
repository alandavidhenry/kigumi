import { z } from 'zod'

import { EQUIPMENT_CATEGORIES } from '@/lib/equipment-types'

import {
  DEFAULT_PAT_INTERVAL_MONTHS,
  DEFAULT_PLAN_LEAD_DAYS,
  DEFAULT_WARRANTY_LEAD_DAYS,
  MAX_LEAD_DAYS,
  PAT_INTERVAL_MONTHS,
  PAT_RESULTS,
  PAT_TEST_TYPES
} from './types'

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date')

const optionalDate = isoDate
  .optional()
  .nullable()
  .transform((value) => value ?? null)

// The wall-clock moment a piece of work was done, never in the future.
const pastOrToday = isoDate.refine(
  (value) => Date.parse(`${value}T00:00:00Z`) <= Date.now() + 86_400_000,
  'That date is in the future'
)

const interval = (max: number) =>
  z
    .number()
    .int('Whole numbers only')
    .min(1)
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value ?? null)

const leadDays = (fallback: number) =>
  z.number().int().min(0).max(MAX_LEAD_DAYS).default(fallback)

// ---------------------------------------------------------------------------
// Plans

const planFields = {
  equipmentItemId: z.string().trim().min(1).optional().nullable(),
  category: z.enum(EQUIPMENT_CATEGORIES).optional().nullable(),
  title: z.string().trim().min(1, 'A title is required').max(120),
  notes: text(1000),
  intervalDays: interval(3650),
  intervalHours: interval(100_000),
  leadDays: leadDays(DEFAULT_PLAN_LEAD_DAYS),
  active: z.boolean().default(true),
  startsOn: optionalDate
}

export const planInputSchema = z
  .object(planFields)
  .refine((plan) => Boolean(plan.equipmentItemId) !== Boolean(plan.category), {
    message: 'Choose either one item or a whole category',
    path: ['equipmentItemId']
  })
  .refine((plan) => plan.intervalDays !== null || plan.intervalHours !== null, {
    message: 'Set an interval in days, in usage hours, or both',
    path: ['intervalDays']
  })

// What a plan targets cannot change after creation (it would orphan its
// tasks and their history); everything else can.
export const planUpdateSchema = z
  .object({
    title: planFields.title,
    notes: planFields.notes,
    intervalDays: planFields.intervalDays,
    intervalHours: planFields.intervalHours,
    leadDays: planFields.leadDays,
    active: planFields.active,
    startsOn: planFields.startsOn
  })
  .partial()

export const completeTaskSchema = z.object({
  performedAt: pastOrToday.optional(),
  notes: text(2000),
  costMinor: z
    .number()
    .int('Use whole pence')
    .min(0)
    .max(100_000_000)
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  // Reading from the item's hour meter, when it has one. Falls back to the
  // recorded usage.
  hoursAtService: z
    .number()
    .min(0)
    .max(10_000_000)
    .optional()
    .nullable()
    .transform((value) => value ?? null)
})

export const usageInputSchema = z.object({
  hours: z.number().min(0).max(10_000_000)
})

// ---------------------------------------------------------------------------
// PAT

export const patInputSchema = z.object({
  equipmentItemId: z.string().trim().min(1),
  testedAt: pastOrToday,
  testType: z.enum(PAT_TEST_TYPES).default('combined'),
  result: z.enum(PAT_RESULTS),
  testerName: text(100),
  reference: text(100),
  notes: text(1000),
  intervalMonths: z
    .number()
    .int()
    .refine(
      (value) => (PAT_INTERVAL_MONTHS as readonly number[]).includes(value),
      'Choose 3, 6, 12, 24 or 48 months'
    )
    .default(DEFAULT_PAT_INTERVAL_MONTHS)
})

export const patUpdateSchema = z
  .object({
    testedAt: patInputSchema.shape.testedAt,
    testType: patInputSchema.shape.testType,
    result: patInputSchema.shape.result,
    testerName: patInputSchema.shape.testerName,
    reference: patInputSchema.shape.reference,
    notes: patInputSchema.shape.notes,
    intervalMonths: patInputSchema.shape.intervalMonths
  })
  .partial()

// ---------------------------------------------------------------------------
// Warranty

const warrantyFields = {
  equipmentItemId: z.string().trim().min(1),
  startsOn: optionalDate,
  endsOn: isoDate,
  provider: text(150),
  reference: text(100),
  terms: text(2000),
  leadDays: leadDays(DEFAULT_WARRANTY_LEAD_DAYS)
}

export const warrantyInputSchema = z
  .object(warrantyFields)
  .refine((w) => !w.startsOn || w.startsOn <= w.endsOn, {
    message: 'The warranty cannot end before it starts',
    path: ['endsOn']
  })

export const warrantyUpdateSchema = z
  .object({
    startsOn: warrantyFields.startsOn,
    endsOn: warrantyFields.endsOn,
    provider: warrantyFields.provider,
    reference: warrantyFields.reference,
    terms: warrantyFields.terms,
    leadDays: warrantyFields.leadDays
  })
  .partial()

// ---------------------------------------------------------------------------
// Lists

export const taskFilterSchema = z.object({
  scope: z.enum(['attention', 'all']).default('attention'),
  equipmentItemId: z.string().trim().min(1).optional()
})

export const notificationReadSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })
])

export type PlanInput = z.infer<typeof planInputSchema>
export type PatInput = z.infer<typeof patInputSchema>
export type WarrantyInput = z.infer<typeof warrantyInputSchema>

export const logInputSchema = z.object({
  equipmentItemId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'A title is required').max(120),
  performedAt: pastOrToday.optional(),
  notes: text(2000),
  costMinor: completeTaskSchema.shape.costMinor,
  hoursAtService: completeTaskSchema.shape.hoursAtService
})

export const logFilterSchema = z.object({
  equipmentItemId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
})
