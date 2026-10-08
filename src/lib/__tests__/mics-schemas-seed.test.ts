import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  micInputSchema,
  micSlug,
  micUpdateSchema,
  provenanceInputSchema
} from '@/lib/mics/schemas'
import {
  capFor,
  ingestEntries,
  makersFileSchema,
  seedFileSchema,
  validateSeedSet
} from '@/lib/mics/seed'
import type { SeedFile } from '@/lib/mics/seed'

const unverified = {
  extraction: 'drafted_unverified' as const,
  fields: ['transducerType' as const]
}

const base = {
  manufacturer: 'Shure',
  model: 'SM57',
  transducerType: 'dynamic',
  polarPatterns: ['cardioid'],
  powering: 'none',
  provenance: [unverified]
}

describe('micSlug', () => {
  it('slugifies maker and model', () => {
    expect(micSlug('Shure', 'SM57')).toBe('shure-sm57')
    expect(micSlug('Schoeps', 'CMC 6 + MK 4')).toBe('schoeps-cmc-6-plus-mk-4')
    expect(micSlug('RØDE', 'NT1 (5th gen)')).toBe('r-de-nt1-5th-gen')
  })
})

describe('provenanceInputSchema', () => {
  it('requires a URL and date for real sources', () => {
    const result = provenanceInputSchema.safeParse({
      extraction: 'manual_transcription'
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      'sourceUrl',
      'retrievedAt'
    ])
  })

  it('lets an unverified draft omit them', () => {
    expect(provenanceInputSchema.safeParse(unverified).success).toBe(true)
  })

  it('checks the document hash shape', () => {
    expect(
      provenanceInputSchema.safeParse({
        ...unverified,
        documentSha256: 'abc'
      }).success
    ).toBe(false)
  })
})

describe('micInputSchema', () => {
  it('accepts a minimal entry and applies defaults', () => {
    const parsed = micInputSchema.parse(base)
    expect(parsed.discontinued).toBe(false)
    expect(parsed.pads).toEqual([])
    expect(parsed.frequencyResponses).toEqual([])
  })

  it('rejects unknown vocabulary', () => {
    expect(
      micInputSchema.safeParse({ ...base, transducerType: 'laser' }).success
    ).toBe(false)
    expect(
      micInputSchema.safeParse({ ...base, polarPatterns: ['wide'] }).success
    ).toBe(false)
    expect(
      micInputSchema.safeParse({ ...base, polarPatterns: [] }).success
    ).toBe(false)
  })

  it('rejects an inverted frequency range', () => {
    const result = micInputSchema.safeParse({
      ...base,
      freqRangeMinHz: 15000,
      freqRangeMaxHz: 40
    })
    expect(result.success).toBe(false)
  })

  it('rejects a curve that points at a missing provenance entry', () => {
    const result = micInputSchema.safeParse({
      ...base,
      frequencyResponses: [
        {
          pattern: 'cardioid',
          method: 'digitised_from_graph',
          points: [
            [100, 0],
            [1000, 0]
          ],
          provenanceIndex: 4
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects curve points outside the physical range', () => {
    const result = micInputSchema.safeParse({
      ...base,
      frequencyResponses: [
        {
          pattern: 'cardioid',
          method: 'manufacturer_numeric',
          points: [
            [1, 0],
            [1000, 200]
          ]
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('micUpdateSchema', () => {
  it('leaves omitted fields undefined (no defaults overwrite stored data)', () => {
    const parsed = micUpdateSchema.parse({ weightG: 298 })
    expect(parsed).toEqual({ weightG: 298 })
  })

  it('still validates what is sent', () => {
    expect(micUpdateSchema.safeParse({ weightG: -4 }).success).toBe(false)
  })
})

describe('validateSeedSet', () => {
  const file = (maker: string, models: string[]): SeedFile => ({
    maker,
    entries: models.map((model) =>
      micInputSchema.parse({ ...base, manufacturer: maker, model })
    )
  })

  it('counts entries per maker', () => {
    const report = validateSeedSet(
      [file('Shure', ['SM57', 'SM58']), file('Neumann', ['U 87 Ai'])],
      {}
    )
    expect(report.countsByMaker).toEqual({ Shure: 2, Neumann: 1 })
    expect(report.errors).toEqual([])
    expect(report.warnings).toHaveLength(2)
  })

  it('enforces the per-maker cap of a third of the current range', () => {
    expect(capFor(11)).toBe(4)
    const report = validateSeedSet(
      [file('Shure', ['SM57', 'SM58', 'SM7B', 'Beta 52A', 'SM81'])],
      { Shure: { currentRange: 11, countedOn: '2026-10-08' } }
    )
    expect(report.errors[0]).toMatch(/exceeds the cap of 4/)
  })

  it('does not count open-dataset entries towards the cap', () => {
    const open = micInputSchema.parse({
      ...base,
      model: 'SM58',
      provenance: [
        {
          extraction: 'dataset_import',
          sourceUrl: 'https://example.org/data',
          retrievedAt: '2026-10-08',
          fields: ['transducerType']
        }
      ]
    })
    const report = validateSeedSet([{ maker: 'Shure', entries: [open] }], {
      Shure: { currentRange: 3, countedOn: '2026-10-08' }
    })
    expect(report.countsByMaker).toEqual({})
    expect(report.errors).toEqual([])
  })

  it('flags duplicates and entries in the wrong maker file', () => {
    const report = validateSeedSet(
      [file('Shure', ['SM57', 'SM57']), file('Neumann', [])].map((f) =>
        f.maker === 'Neumann'
          ? {
              ...f,
              entries: [
                micInputSchema.parse({ ...base, manufacturer: 'Shure' })
              ]
            }
          : f
      ),
      {}
    )
    expect(report.errors.some((e) => /duplicates/.test(e))).toBe(true)
    expect(
      report.errors.some((e) => /listed in the Neumann file/.test(e))
    ).toBe(true)
  })
})

describe('the shipped seed files (data/mics)', () => {
  const dir = path.resolve('data/mics')
  const read = (name: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json') && n !== 'makers.json')
  const files = names.map((name) => seedFileSchema.parse(read(name)))

  it('all parse and pass validation', () => {
    const makers = makersFileSchema.parse(read('makers.json'))
    const report = validateSeedSet(files, makers)
    expect(report.errors).toEqual([])
    expect(report.total).toBe(22)
  })

  it('covers every transducer type, powering case and pattern the rules need', () => {
    const entries = files.flatMap((f) => f.entries)
    const types = new Set(entries.map((e) => e.transducerType))
    expect(types).toEqual(new Set(['dynamic', 'ldc', 'sdc', 'ribbon']))
    expect(new Set(entries.map((e) => e.powering))).toEqual(
      new Set(['none', 'phantom'])
    )
    const patterns = new Set(entries.flatMap((e) => e.polarPatterns))
    expect(patterns.has('figure8')).toBe(true)
    expect(patterns.has('supercardioid')).toBe(true)
    expect(patterns.has('omni')).toBe(true)
  })

  it('never invents numbers: only the sourced SM57 range carries a value', () => {
    const entries = files.flatMap((f) => f.entries)
    const numeric = [
      'sensitivityMvPa',
      'selfNoiseDbA',
      'maxSplDb',
      'impedanceOhm',
      'weightG'
    ] as const
    for (const entry of entries) {
      for (const key of numeric) expect(entry[key]).toBeUndefined()
    }
    const withRange = entries.filter((e) => e.freqRangeMinHz != null)
    expect(withRange.map((e) => e.model)).toEqual(['SM57'])
  })

  it('leaves ribbon phantom tolerance blank for a human to transcribe', () => {
    const ribbons = files
      .flatMap((f) => f.entries)
      .filter((e) => e.transducerType === 'ribbon')
    expect(ribbons.length).toBeGreaterThanOrEqual(3)
    for (const ribbon of ribbons) expect(ribbon.phantomSafe).toBeUndefined()
  })

  it('gives every populated spec field a provenance entry', () => {
    for (const entry of files.flatMap((f) => f.entries)) {
      const covered = new Set(entry.provenance.flatMap((p) => p.fields))
      for (const field of [
        'transducerType',
        'polarPatterns',
        'powering'
      ] as const) {
        expect(covered.has(field), `${entry.model} ${field}`).toBe(true)
      }
      if (entry.freqRangeMinHz != null) {
        expect(covered.has('freqRangeMinHz')).toBe(true)
      }
    }
  })
})

describe('ingestEntries', () => {
  const entry = micInputSchema.parse(base)

  function fakeDb(existing: { id: string; status: string } | null) {
    const db = {
      microphoneModel: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
        update: vi.fn().mockResolvedValue({})
      },
      provenance: {
        create: vi.fn().mockResolvedValue({ id: 'p1' }),
        deleteMany: vi.fn()
      },
      micFieldProvenance: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        upsert: vi.fn()
      },
      micFrequencyResponse: { create: vi.fn(), deleteMany: vi.fn() },
      micPolarData: { create: vi.fn(), deleteMany: vi.fn() }
    }
    return db
  }

  it('creates new models as drafts', async () => {
    const db = fakeDb(null)
    const result = await ingestEntries(db as never, [entry])
    expect(result.created).toEqual(['shure-sm57'])
    expect(db.microphoneModel.create.mock.calls[0][0].data).toMatchObject({
      slug: 'shure-sm57',
      status: 'draft'
    })
    expect(db.micFieldProvenance.upsert).toHaveBeenCalled()
  })

  it('refreshes existing drafts', async () => {
    const db = fakeDb({ id: 'm1', status: 'draft' })
    const result = await ingestEntries(db as never, [entry])
    expect(result.updated).toEqual(['shure-sm57'])
    expect(db.microphoneModel.create).not.toHaveBeenCalled()
  })

  it('never touches a published record', async () => {
    const db = fakeDb({ id: 'm1', status: 'published' })
    const result = await ingestEntries(db as never, [entry])
    expect(result.skippedPublished).toEqual(['shure-sm57'])
    expect(db.microphoneModel.update).not.toHaveBeenCalled()
    expect(db.microphoneModel.create).not.toHaveBeenCalled()
  })

  it('writes nothing on a dry run', async () => {
    const db = fakeDb(null)
    const result = await ingestEntries(db as never, [entry], { dryRun: true })
    expect(result.created).toHaveLength(1)
    expect(db.microphoneModel.create).not.toHaveBeenCalled()
  })
})
