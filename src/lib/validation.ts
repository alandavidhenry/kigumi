import { z } from 'zod'

import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES } from '@/lib/equipment-types'

// Input schemas shared by route handlers and forms. Lengths are stored in
// millimetres; forms collect metres and convert with metresToMm.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const studioFields = {
  name: z.string().trim().min(1, 'Name is required').max(100),
  address: optionalText(300),
  timezone: z.string().trim().refine(isValidTimeZone, 'Unknown time zone'),
  notes: optionalText(2000)
}

export const studioInputSchema = z.object({
  ...studioFields,
  timezone: studioFields.timezone.default('Europe/London')
})

// Built from the raw fields, not studioInputSchema.partial(), so defaults
// never overwrite stored values on a partial update.
export const studioUpdateSchema = z.object(studioFields).partial()

// 0.5 m – 100 m footprint, 1 m – 30 m ceiling: generous bounds that still
// catch unit mistakes (e.g. metres typed into a millimetre field).
const lengthMm = (min: number, max: number) =>
  z
    .number()
    .int('Use whole millimetres')
    .min(min, `Must be at least ${min / 1000} m`)
    .max(max, `Must be at most ${max / 1000} m`)

export const roomInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  widthMm: lengthMm(500, 100_000),
  lengthMm: lengthMm(500, 100_000),
  heightMm: lengthMm(1000, 30_000).optional().nullable(),
  notes: optionalText(2000)
})

export const roomUpdateSchema = roomInputSchema.partial()

// ---------------------------------------------------------------------------
// Equipment (Phase 1). Prices are stored in minor units (pence); forms and CSV
// collect major units and convert with majorToMinor.
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date')

const equipmentFields = {
  category: z.enum(EQUIPMENT_CATEGORIES),
  make: z.string().trim().min(1, 'Make is required').max(100),
  model: z.string().trim().min(1, 'Model is required').max(100),
  serial: optionalText(100),
  quantity: z.number().int('Whole numbers only').min(1).max(10_000),
  status: z.enum(EQUIPMENT_STATUSES),
  roomId: z.string().trim().min(1).optional().nullable(),
  purchaseDate: isoDate
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  purchasePriceMinor: z
    .number()
    .int('Use whole pence')
    .min(0)
    .max(100_000_000)
    .optional()
    .nullable()
    .transform((value) => value ?? null),
  supplier: optionalText(150),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20, 'At most 20 tags')
    .transform((tags) => [...new Set(tags)]),
  customFields: z
    .record(z.string().trim().min(1).max(60), z.string().trim().max(300))
    .refine((fields) => Object.keys(fields).length <= 20, 'At most 20 fields')
    .optional()
    .nullable()
    .transform((value) =>
      value && Object.keys(value).length > 0 ? value : null
    ),
  notes: optionalText(2000)
}

export const equipmentInputSchema = z.object({
  ...equipmentFields,
  quantity: equipmentFields.quantity.default(1),
  status: equipmentFields.status.default('in_service'),
  tags: equipmentFields.tags.default([])
})

// Raw fields (not .partial() on the input schema) so defaults never overwrite
// stored values on a partial update.
export const equipmentUpdateSchema = z.object(equipmentFields).partial()

export const equipmentFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(EQUIPMENT_CATEGORIES).optional(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  roomId: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).max(40).optional()
})

export type EquipmentInput = z.input<typeof equipmentInputSchema>
export type EquipmentUpdate = z.input<typeof equipmentUpdateSchema>
export type EquipmentFilter = z.input<typeof equipmentFilterSchema>

export function majorToMinor(major: number): number {
  return Math.round(major * 100)
}

export function minorToMajor(minor: number): number {
  return minor / 100
}

export function formatMoney(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(minorToMajor(minor))
}

export type StudioInput = z.input<typeof studioInputSchema>
export type StudioUpdate = z.input<typeof studioUpdateSchema>
export type RoomInput = z.input<typeof roomInputSchema>
export type RoomUpdate = z.input<typeof roomUpdateSchema>

export function metresToMm(metres: number): number {
  return Math.round(metres * 1000)
}

export function mmToMetres(mm: number): number {
  return mm / 1000
}

export function formatDimensions(
  widthMm: number,
  lengthMm: number,
  heightMm?: number | null
): string {
  const parts = [widthMm, lengthMm, heightMm]
    .filter((value): value is number => typeof value === 'number')
    .map((value) => `${mmToMetres(value).toFixed(2)}`)
  return `${parts.join(' × ')} m`
}
