import type { Prisma } from '@/generated/prisma/client'

// Converts a plain value into the shape Prisma expects when writing a nullable
// JSON column: `undefined` leaves the field untouched, `null` writes SQL NULL
// (via the 'DbNull' sentinel), and any other value is stored as JSON.
export function toJsonValue(
  value: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  if (value === null) return 'DbNull'
  return value as Prisma.InputJsonValue
}
