import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import {
  changeMicStatus,
  checkPublishable,
  countMicsByStatus,
  createMic,
  getMicForAdmin,
  isFieldPopulated,
  listMicsForReview,
  updateMic
} from '@/lib/mics/admin'
import { toMicDetail } from '@/lib/mics/catalogue'
import type { MicDetail, RawMicDetail } from '@/lib/mics/catalogue'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn()
  })
  const client = {
    microphoneModel: model(),
    provenance: model(),
    micFieldProvenance: model(),
    micFrequencyResponse: model(),
    micPolarData: model(),
    $transaction: vi.fn()
  }
  client.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(client)
  )
  return { default: client }
})

const db = vi.mocked(prisma, true)
const admin = { userId: 'admin_1', userName: 'Admin', userEmail: 'a@x.test' }

const sourceRow = (
  overrides: Partial<{
    id: string
    extraction: string
    verifiedById: string | null
    sourceUrl: string | null
  }> = {}
) => ({
  id: 'p1',
  sourceUrl: 'https://maker.example/sheet',
  documentTitle: 'Spec sheet',
  documentPage: '2',
  retrievedAt: new Date('2026-10-08T00:00:00Z'),
  licenceNotes: null,
  attribution: null,
  confidence: 'medium',
  extraction: 'manual_transcription',
  verifiedById: null,
  ...overrides
})

function rawMic(overrides: Partial<RawMicDetail> = {}): RawMicDetail {
  const source = sourceRow()
  return {
    id: 'm1',
    slug: 'shure-sm57',
    manufacturer: 'Shure',
    model: 'SM57',
    transducerType: 'dynamic',
    polarPatterns: ['cardioid'],
    powering: 'none',
    phantomSafe: null,
    discontinued: false,
    status: 'in_review',
    freqRangeMinHz: 40,
    freqRangeMaxHz: 15000,
    sensitivityMvPa: null,
    selfNoiseDbA: null,
    maxSplDb: null,
    impedanceOhm: null,
    pads: [],
    filters: [],
    weightG: null,
    dimensions: null,
    connector: null,
    statedApplications: [],
    specSheetUrl: null,
    wikidataId: null,
    specConditions: null,
    reviewNotes: null,
    reviewedAt: null,
    publishedAt: null,
    frequencyResponses: [],
    polarData: [],
    fieldProvenance: [
      'transducerType',
      'polarPatterns',
      'powering',
      'freqRangeMinHz',
      'freqRangeMaxHz'
    ].map((field) => ({ field, provenance: source })),
    ...overrides
  }
}

const detail = (overrides: Partial<RawMicDetail> = {}): MicDetail =>
  toMicDetail(rawMic(overrides))

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
    fn(db)) as never)
})

describe('isFieldPopulated', () => {
  it('only counts claims: discontinued=true, known phantomSafe, non-empty lists', () => {
    const mic = detail()
    expect(isFieldPopulated(mic, 'discontinued')).toBe(false)
    expect(isFieldPopulated(mic, 'phantomSafe')).toBe(false)
    expect(isFieldPopulated(mic, 'pads')).toBe(false)
    expect(isFieldPopulated(mic, 'freqRangeMinHz')).toBe(true)
    expect(
      isFieldPopulated(detail({ phantomSafe: false }), 'phantomSafe')
    ).toBe(true)
    expect(
      isFieldPopulated(detail({ discontinued: true }), 'discontinued')
    ).toBe(true)
  })
})

describe('checkPublishable', () => {
  it('passes when every populated field has a real source', () => {
    expect(checkPublishable(detail())).toEqual({
      blockers: [],
      needsVerification: false
    })
  })

  it('blocks a populated field with no provenance', () => {
    const { blockers } = checkPublishable(detail({ sensitivityMvPa: 1.6 }))
    expect(blockers).toEqual(['Sensitivity has no source'])
  })

  it('blocks fields whose only source is an unverified draft', () => {
    const unverified = sourceRow({
      id: 'p2',
      extraction: 'drafted_unverified',
      sourceUrl: null
    })
    const { blockers } = checkPublishable(
      detail({
        fieldProvenance: [
          { field: 'transducerType', provenance: unverified },
          { field: 'polarPatterns', provenance: unverified },
          { field: 'powering', provenance: unverified },
          { field: 'freqRangeMinHz', provenance: sourceRow() },
          { field: 'freqRangeMaxHz', provenance: sourceRow() }
        ]
      })
    )
    expect(blockers).toEqual([
      'Transducer type is an unverified draft',
      'Polar patterns is an unverified draft',
      'Powering is an unverified draft'
    ])
  })

  it('requires a source for measured curves but not idealised ones', () => {
    const curve = {
      id: 'c1',
      pattern: 'cardioid',
      filterSetting: null,
      points: [
        [100, 0],
        [1000, 0]
      ],
      method: 'digitised_from_graph',
      provenanceId: null,
      provenance: null
    }
    expect(
      checkPublishable(detail({ frequencyResponses: [curve] })).blockers
    ).toEqual(['Frequency response (cardioid) has no source'])
    expect(
      checkPublishable(
        detail({ frequencyResponses: [{ ...curve, method: 'idealised' }] })
      ).blockers
    ).toEqual([])
  })

  it('asks for reviewer attestation on unverified LLM-drafted values', () => {
    const drafted = sourceRow({ extraction: 'llm_drafted' })
    const check = checkPublishable(
      detail({
        fieldProvenance: rawMic().fieldProvenance.map((row) => ({
          ...row,
          provenance: drafted
        }))
      })
    )
    expect(check.blockers).toEqual([])
    expect(check.needsVerification).toBe(true)

    const verified = sourceRow({
      extraction: 'llm_drafted',
      verifiedById: 'admin_1'
    })
    expect(
      checkPublishable(
        detail({
          fieldProvenance: rawMic().fieldProvenance.map((row) => ({
            ...row,
            provenance: verified
          }))
        })
      ).needsVerification
    ).toBe(false)
  })
})

describe('changeMicStatus', () => {
  const setCurrent = (overrides: Partial<RawMicDetail> = {}) => {
    db.microphoneModel.findUnique.mockResolvedValue(rawMic(overrides) as never)
    db.microphoneModel.findUniqueOrThrow.mockResolvedValue(
      rawMic({ ...overrides, status: 'published' }) as never
    )
  }

  it('publishes a fully sourced mic and records the reviewer', async () => {
    setCurrent()
    const result = await changeMicStatus(admin, 'm1', { status: 'published' })
    expect(result.status).toBe('published')
    const { data } = db.microphoneModel.update.mock.calls[0][0]
    expect(data).toMatchObject({
      status: 'published',
      reviewedById: 'admin_1'
    })
    expect(data.publishedAt).toBeInstanceOf(Date)
  })

  it('refuses to publish with blockers and says which', async () => {
    setCurrent({ sensitivityMvPa: 1.6 })
    const promise = changeMicStatus(admin, 'm1', { status: 'published' })
    await expectAppError(promise, 'BAD_REQUEST')
    await expect(promise).rejects.toMatchObject({
      details: { blockers: ['Sensitivity has no source'] }
    })
    expect(db.microphoneModel.update).not.toHaveBeenCalled()
  })

  it('demands attestation for LLM-drafted values, then marks them verified', async () => {
    const drafted = sourceRow({ extraction: 'llm_drafted' })
    setCurrent({
      fieldProvenance: rawMic().fieldProvenance.map((row) => ({
        ...row,
        provenance: drafted
      }))
    })
    await expectAppError(
      changeMicStatus(admin, 'm1', { status: 'published' }),
      'BAD_REQUEST'
    )
    expect(db.provenance.updateMany).not.toHaveBeenCalled()

    await changeMicStatus(admin, 'm1', {
      status: 'published',
      confirmVerified: true
    })
    expect(db.provenance.updateMany.mock.calls[0][0]!.data).toMatchObject({
      verifiedById: 'admin_1'
    })
  })

  it('requires notes when sending back to draft', async () => {
    setCurrent()
    await expectAppError(
      changeMicStatus(admin, 'm1', { status: 'draft' }),
      'BAD_REQUEST'
    )
    await changeMicStatus(admin, 'm1', {
      status: 'draft',
      notes: 'Sensitivity looks wrong'
    })
    expect(db.microphoneModel.update.mock.calls[0][0]!.data).toMatchObject({
      status: 'draft',
      reviewNotes: 'Sensitivity looks wrong',
      publishedAt: null
    })
  })

  it('only allows sensible transitions: a draft cannot jump to published', async () => {
    setCurrent({ status: 'draft' })
    await expectAppError(
      changeMicStatus(admin, 'm1', { status: 'published' }),
      'BAD_REQUEST'
    )
  })

  it('404s for an unknown mic', async () => {
    db.microphoneModel.findUnique.mockResolvedValue(null)
    await expectAppError(
      changeMicStatus(admin, 'nope', { status: 'in_review' }),
      'NOT_FOUND'
    )
  })
})

describe('createMic / updateMic', () => {
  const input = {
    manufacturer: 'Shure',
    model: 'SM58',
    transducerType: 'dynamic',
    polarPatterns: ['cardioid'],
    powering: 'none',
    provenance: [
      {
        extraction: 'manual_transcription',
        sourceUrl: 'https://maker.example/sm58',
        retrievedAt: '2026-10-08',
        fields: ['transducerType', 'polarPatterns', 'powering']
      }
    ]
  }

  it('creates a draft with provenance links', async () => {
    db.microphoneModel.findUnique.mockResolvedValue(null)
    db.microphoneModel.create.mockResolvedValue({ id: 'new' } as never)
    db.provenance.create.mockResolvedValue({ id: 'p9' } as never)
    db.microphoneModel.findUniqueOrThrow.mockResolvedValue(
      rawMic({ id: 'new', status: 'draft' }) as never
    )
    const mic = await createMic(admin, input)
    expect(mic.status).toBe('draft')
    expect(db.microphoneModel.create.mock.calls[0][0]!.data).toMatchObject({
      slug: 'shure-sm58',
      status: 'draft'
    })
    expect(db.micFieldProvenance.upsert).toHaveBeenCalledTimes(3)
  })

  it('rejects a duplicate and invalid input before any write', async () => {
    db.microphoneModel.findUnique.mockResolvedValue({ id: 'x' } as never)
    await expectAppError(createMic(admin, input), 'BAD_REQUEST')
    await expect(createMic(admin, { model: 'x' })).rejects.toThrow()
    expect(db.microphoneModel.create).not.toHaveBeenCalled()
  })

  it('updates only the fields sent and keeps sources when none are sent', async () => {
    db.microphoneModel.findUnique.mockResolvedValue({ id: 'm1' } as never)
    db.microphoneModel.findUniqueOrThrow.mockResolvedValue(rawMic() as never)
    await updateMic(admin, 'm1', { weightG: 298 })
    expect(db.microphoneModel.update.mock.calls[0][0]!.data).toEqual({
      weightG: 298
    })
    expect(db.micFieldProvenance.deleteMany).not.toHaveBeenCalled()
    expect(db.micFrequencyResponse.deleteMany).not.toHaveBeenCalled()
  })

  it('404s when updating an unknown mic', async () => {
    db.microphoneModel.findUnique.mockResolvedValue(null)
    await expectAppError(updateMic(admin, 'nope', { weightG: 1 }), 'NOT_FOUND')
  })
})

describe('queue reads', () => {
  it('lists with the filters applied and counts unverified fields', async () => {
    db.microphoneModel.findMany.mockResolvedValue([
      {
        ...rawMic(),
        updatedAt: new Date('2026-10-08T10:00:00Z'),
        fieldProvenance: [{ id: 'a' }, { id: 'b' }]
      }
    ] as never)
    const rows = await listMicsForReview(admin, {
      status: 'in_review',
      pattern: 'cardioid'
    })
    expect(rows[0].unverifiedFields).toBe(2)
    expect(db.microphoneModel.findMany.mock.calls[0][0]!.where).toMatchObject({
      status: 'in_review',
      polarPatterns: { has: 'cardioid' }
    })
  })

  it('rejects a junk status filter', async () => {
    await expect(listMicsForReview(admin, { status: 'live' })).rejects.toThrow()
  })

  it('counts by status with zeros for empty ones', async () => {
    db.microphoneModel.groupBy.mockResolvedValue([
      { status: 'draft', _count: { _all: 22 } }
    ] as never)
    expect(await countMicsByStatus(admin)).toEqual({
      draft: 22,
      in_review: 0,
      published: 0
    })
  })

  it('returns the publish check with the detail', async () => {
    db.microphoneModel.findUnique.mockResolvedValue(
      rawMic({ sensitivityMvPa: 1.6 }) as never
    )
    const mic = await getMicForAdmin(admin, 'm1')
    expect(mic.publish.blockers).toHaveLength(1)
  })
})
