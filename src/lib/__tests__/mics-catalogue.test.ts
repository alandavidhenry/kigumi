import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { getMic, listMicManufacturers, listMics } from '@/lib/mics/catalogue'
import {
  NOT_RECORDED,
  mvPaToDbvPa,
  phantomWarning,
  specRows
} from '@/lib/mics/format'
import prisma from '@/lib/prisma'
import { makeContext } from '@/test/fixtures'

// First call's `where`, typed loosely so assertions can probe any key.
const whereOf = (fn: { mock: { calls: unknown[][] } }) =>
  (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where

vi.mock('@/lib/prisma', () => ({
  default: {
    microphoneModel: { findMany: vi.fn(), findFirst: vi.fn() }
  }
}))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: never }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

const db = vi.mocked(prisma, true)
const viewer = makeContext({ role: 'viewer' as never })

const summary = {
  id: 'm1',
  slug: 'shure-sm57',
  manufacturer: 'Shure',
  model: 'SM57',
  transducerType: 'dynamic',
  polarPatterns: ['cardioid'],
  powering: 'none',
  phantomSafe: null,
  discontinued: false,
  status: 'published'
}

beforeEach(() => vi.clearAllMocks())

describe('listMics', () => {
  it('only ever asks for published models', async () => {
    db.microphoneModel.findMany.mockResolvedValue([summary] as never)
    const mics = await listMics(viewer, { status: 'draft' } as never).catch(
      () => null
    )
    expect(mics).not.toBeNull()
    expect(whereOf(db.microphoneModel.findMany).status).toBe('published')
  })

  it('applies filters', async () => {
    db.microphoneModel.findMany.mockResolvedValue([])
    await listMics(viewer, {
      q: 'sm5',
      transducerType: 'dynamic',
      pattern: 'cardioid',
      powering: 'none'
    })
    const where = whereOf(db.microphoneModel.findMany)
    expect(where).toMatchObject({
      status: 'published',
      transducerType: 'dynamic',
      polarPatterns: { has: 'cardioid' },
      powering: 'none'
    })
    expect(where.OR).toHaveLength(3)
  })

  it('rejects an invalid filter', async () => {
    await expect(listMics(viewer, { pattern: 'wide' })).rejects.toThrow()
  })

  it('lists distinct published makers', async () => {
    db.microphoneModel.findMany.mockResolvedValue([
      { manufacturer: 'Neumann' },
      { manufacturer: 'Shure' }
    ] as never)
    expect(await listMicManufacturers(viewer)).toEqual(['Neumann', 'Shure'])
  })
})

describe('getMic', () => {
  it('404s for unpublished or unknown models', async () => {
    db.microphoneModel.findFirst.mockResolvedValue(null)
    await expect(getMic(viewer, 'draft-mic')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
    await expect(getMic(viewer, 'x')).rejects.toBeInstanceOf(AppError)
    const where = whereOf(db.microphoneModel.findFirst)
    expect(where.status).toBe('published')
  })

  it('accepts an id or a slug', async () => {
    db.microphoneModel.findFirst.mockResolvedValue(null)
    await getMic(viewer, 'shure-sm57').catch(() => null)
    expect(whereOf(db.microphoneModel.findFirst).OR).toEqual([
      { id: 'shure-sm57' },
      { slug: 'shure-sm57' }
    ])
  })
})

describe('specRows', () => {
  const mic = (overrides = {}) =>
    ({
      ...summary,
      freqRangeMinHz: 40,
      freqRangeMaxHz: 15000,
      sensitivityMvPa: null,
      selfNoiseDbA: null,
      maxSplDb: 150,
      impedanceOhm: null,
      pads: [],
      filters: [],
      weightG: null,
      dimensions: null,
      connector: null,
      statedApplications: [],
      specSheetUrl: null,
      wikidataId: null,
      specConditions: { maxSplDb: '@ 1% THD' },
      reviewNotes: null,
      reviewedAt: null,
      publishedAt: null,
      frequencyResponses: [],
      polarData: [],
      provenance: [],
      transducerType: 'dynamic',
      polarPatterns: ['cardioid'],
      powering: 'none',
      ...overrides
    }) as never

  it('shows gaps explicitly for the core specs, never a made-up value', () => {
    const rows = specRows(mic())
    const find = (field: string) => rows.find((r) => r.field === field)!
    expect(find('sensitivityMvPa')).toMatchObject({
      value: NOT_RECORDED,
      recorded: false
    })
    expect(find('freqRangeMinHz').value).toBe('40 Hz')
    expect(find('freqRangeMaxHz').value).toBe('15k Hz')
  })

  it('keeps stated conditions beside the value', () => {
    const row = specRows(mic()).find((r) => r.field === 'maxSplDb')!
    expect(row.value).toBe('150 dB SPL')
    expect(row.conditions).toBe('@ 1% THD')
  })

  it('hides optional fields that are empty', () => {
    const fields = specRows(mic()).map((r) => r.field)
    expect(fields).not.toContain('pads')
    expect(fields).not.toContain('weightG')
    expect(fields).not.toContain('discontinued')
  })

  it('shows sensitivity in both units', () => {
    const row = specRows(mic({ sensitivityMvPa: 1.6 })).find(
      (r) => r.field === 'sensitivityMvPa'
    )!
    expect(row.value).toBe('1.6 mV/Pa (-55.92 dBV/Pa)')
    expect(mvPaToDbvPa(1)).toBeCloseTo(-60)
  })
})

describe('phantomWarning', () => {
  it('warns for ribbons unless the maker says phantom is safe', () => {
    expect(
      phantomWarning({ transducerType: 'ribbon', phantomSafe: null })
    ).toMatch(/not recorded/)
    expect(
      phantomWarning({ transducerType: 'ribbon', phantomSafe: false })
    ).toMatch(/can damage/)
    expect(
      phantomWarning({ transducerType: 'ribbon', phantomSafe: true })
    ).toBeNull()
  })

  it('says nothing for other transducers', () => {
    expect(
      phantomWarning({ transducerType: 'ldc', phantomSafe: null })
    ).toBeNull()
  })
})
