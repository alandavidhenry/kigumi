import { describe, expect, it } from 'vitest'

import {
  equipmentInputSchema,
  equipmentUpdateSchema,
  formatDimensions,
  formatMoney,
  isValidTimeZone,
  majorToMinor,
  metresToMm,
  minorToMajor,
  mmToMetres,
  roomInputSchema,
  roomUpdateSchema,
  studioInputSchema,
  studioUpdateSchema
} from '@/lib/validation'

describe('studioInputSchema', () => {
  it('trims and defaults', () => {
    expect(studioInputSchema.parse({ name: '  Abbey  ' })).toEqual({
      name: 'Abbey',
      address: null,
      timezone: 'Europe/London',
      notes: null
    })
  })

  it('turns blank optional text into null', () => {
    const parsed = studioInputSchema.parse({
      name: 'A',
      address: '   ',
      notes: ''
    })
    expect(parsed.address).toBeNull()
    expect(parsed.notes).toBeNull()
  })

  it('requires a name', () => {
    expect(studioInputSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(studioInputSchema.safeParse({}).success).toBe(false)
  })

  it('rejects unknown time zones', () => {
    expect(
      studioInputSchema.safeParse({ name: 'A', timezone: 'Mars/Olympus' })
        .success
    ).toBe(false)
    expect(
      studioInputSchema.safeParse({ name: 'A', timezone: 'America/New_York' })
        .success
    ).toBe(true)
  })

  it('allows partial updates', () => {
    expect(studioUpdateSchema.parse({ notes: 'Hi' })).toEqual({ notes: 'Hi' })
  })

  it('never fills defaults or nulls into a partial update', () => {
    expect(studioUpdateSchema.parse({ name: 'B' })).toEqual({ name: 'B' })
  })
})

describe('roomInputSchema', () => {
  const valid = { name: 'Live room', widthMm: 6000, lengthMm: 8000 }

  it('accepts a room without a height', () => {
    expect(roomInputSchema.parse(valid)).toEqual({ ...valid, notes: null })
  })

  it('accepts a height', () => {
    expect(roomInputSchema.parse({ ...valid, heightMm: 3200 }).heightMm).toBe(
      3200
    )
  })

  it('rejects sizes that look like unit mistakes', () => {
    expect(roomInputSchema.safeParse({ ...valid, widthMm: 6 }).success).toBe(
      false
    )
    expect(
      roomInputSchema.safeParse({ ...valid, lengthMm: 6_000_000 }).success
    ).toBe(false)
    expect(roomInputSchema.safeParse({ ...valid, heightMm: 300 }).success).toBe(
      false
    )
  })

  it('requires whole millimetres', () => {
    expect(
      roomInputSchema.safeParse({ ...valid, widthMm: 6000.5 }).success
    ).toBe(false)
  })

  it('allows partial updates', () => {
    expect(roomUpdateSchema.parse({ heightMm: null })).toEqual({
      heightMm: null
    })
  })
})

describe('units', () => {
  it('converts metres and millimetres', () => {
    expect(metresToMm(6.25)).toBe(6250)
    expect(metresToMm(3.0004)).toBe(3000)
    expect(mmToMetres(6250)).toBe(6.25)
  })

  it('formats dimensions', () => {
    expect(formatDimensions(6000, 8000)).toBe('6.00 × 8.00 m')
    expect(formatDimensions(6000, 8000, 3200)).toBe('6.00 × 8.00 × 3.20 m')
    expect(formatDimensions(6000, 8000, null)).toBe('6.00 × 8.00 m')
  })

  it('validates time zones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('Nowhere/Land')).toBe(false)
  })
})

describe('equipmentInputSchema', () => {
  const base = { category: 'microphone', make: 'Neumann', model: 'U 87' }

  it('applies defaults', () => {
    expect(equipmentInputSchema.parse(base)).toMatchObject({
      quantity: 1,
      status: 'in_service',
      tags: [],
      serial: null,
      purchaseDate: null,
      purchasePriceMinor: null,
      customFields: null
    })
  })

  it('rejects unknown categories and bad quantities', () => {
    expect(() =>
      equipmentInputSchema.parse({ ...base, category: 'toaster' })
    ).toThrow()
    expect(() => equipmentInputSchema.parse({ ...base, quantity: 0 })).toThrow()
    expect(() =>
      equipmentInputSchema.parse({ ...base, quantity: 1.5 })
    ).toThrow()
  })

  it('validates dates and prices', () => {
    expect(() =>
      equipmentInputSchema.parse({ ...base, purchaseDate: '12/03/2024' })
    ).toThrow()
    expect(() =>
      equipmentInputSchema.parse({ ...base, purchasePriceMinor: -1 })
    ).toThrow()
    expect(
      equipmentInputSchema.parse({ ...base, purchaseDate: '2024-03-12' })
        .purchaseDate
    ).toBe('2024-03-12')
  })

  it('de-duplicates tags and drops empty custom fields', () => {
    const parsed = equipmentInputSchema.parse({
      ...base,
      tags: ['vocal', 'vocal'],
      customFields: {}
    })
    expect(parsed.tags).toEqual(['vocal'])
    expect(parsed.customFields).toBeNull()
  })

  it('does not apply defaults on partial updates', () => {
    expect(equipmentUpdateSchema.parse({ make: 'AKG' })).toEqual({
      make: 'AKG'
    })
  })
})

describe('money helpers', () => {
  it('converts between major and minor units', () => {
    expect(majorToMinor(1299.99)).toBe(129999)
    expect(minorToMajor(129999)).toBe(1299.99)
  })

  it('formats pounds and missing values', () => {
    expect(formatMoney(129999)).toBe('£1,299.99')
    expect(formatMoney(null)).toBe('—')
  })
})
