import { z } from 'zod'

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
