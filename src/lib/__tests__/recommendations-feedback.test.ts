import { beforeEach, describe, expect, it, vi } from 'vitest'

import prisma from '@/lib/prisma'
import { submitFeedback } from '@/lib/recommendations/feedback'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: { microphoneModel: { findMany: vi.fn() } }
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

const catalogue = vi.mocked(prisma.microphoneModel, true)
let db: FakeDb
const ctx = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })

const option = (id: string, unitIds: string[]) => ({
  id,
  unitIds,
  roles: unitIds.map(() => 'single'),
  patternSettings: unitIds.map(() => 'cardioid'),
  score: 1,
  matchedGroup: null,
  reasons: [],
  warnings: []
})

// A stored result: s1 recommended ua (with ub as the other candidate), and s2
// is a stereo pair.
const stored = {
  id: 'res1',
  final: {
    sources: [
      { sourceId: 's1', primary: { units: [{ unitId: 'ua' }] } },
      {
        sourceId: 's2',
        primary: { units: [{ unitId: 'p1' }, { unitId: 'p2' }] }
      }
    ]
  },
  request: {
    rules: {
      sources: [
        {
          id: 's1',
          line: false,
          micCount: 1,
          candidates: [option('s1-1', ['ua']), option('s1-2', ['ub'])]
        },
        {
          id: 's2',
          line: false,
          micCount: 2,
          candidates: [option('s2-1', ['p1', 'p2'])]
        },
        { id: 's3', line: true, micCount: 0, candidates: [] }
      ]
    }
  }
}

const savedRow = (extra = {}) => ({
  sourceKey: 's1',
  verdict: 'accepted',
  swappedToUnitIds: [],
  swappedToModelSlugs: [],
  swappedToCandidate: null,
  rating: null,
  reasons: [],
  comment: null,
  updatedAt: new Date('2026-10-20T12:00:00Z'),
  ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.recommendationResult.findFirst.mockResolvedValue(stored)
  db.recommendationFeedback.upsert.mockImplementation((async (args: {
    create: Record<string, unknown>
  }) => savedRow(args.create)) as never)
  db.microphoneUnit.findMany.mockImplementation((async (args: {
    where: { id: { in: string[] } }
  }) =>
    args.where.id.in
      .filter((id) => id.startsWith('u'))
      .map((id) => ({ id, micModelId: `m_${id}` }))) as never)
  catalogue.findMany.mockResolvedValue([
    { id: 'm_ub', slug: 'shure-sm57' },
    { id: 'm_uc', slug: 'shure-sm58' }
  ] as never)
})

describe('submitFeedback', () => {
  it('records acceptance with a rating and reasons, scoped to the person', async () => {
    const view = await submitFeedback(ctx, 'res1', {
      sourceKey: 's1',
      verdict: 'accepted',
      rating: 5,
      reasons: ['wrong_character'],
      comment: '  Lovely.  '
    })

    const call = db.recommendationFeedback.upsert.mock.calls[0][0]
    expect(call.where).toEqual({
      resultId_sourceKey_userId: {
        resultId: 'res1',
        sourceKey: 's1',
        userId: 'user_1'
      }
    })
    expect(call.create).toMatchObject({
      organisationId: 'org_1',
      resultId: 'res1',
      userId: 'user_1',
      sourceKey: 's1',
      verdict: 'accepted',
      rating: 5,
      reasons: ['wrong_character'],
      comment: 'Lovely.',
      swappedToUnitIds: [],
      swappedToCandidate: null
    })
    expect(view).toMatchObject({ sourceKey: 's1', verdict: 'accepted' })
  })

  it('updates the same row when someone changes their mind', async () => {
    await submitFeedback(ctx, 'res1', { sourceKey: 's1', verdict: 'accepted' })
    await submitFeedback(ctx, 'res1', {
      sourceKey: 's1',
      verdict: 'rejected',
      reasons: ['unsafe']
    })
    const [first, second] = db.recommendationFeedback.upsert.mock.calls
    expect(first[0].where).toEqual(second[0].where)
    expect(second[0].update).toMatchObject({
      verdict: 'rejected',
      reasons: ['unsafe']
    })
  })

  it('accepts feedback on the whole recommendation', async () => {
    await submitFeedback(ctx, 'res1', { sourceKey: '*', verdict: 'accepted' })
    expect(
      db.recommendationFeedback.upsert.mock.calls[0][0].create.sourceKey
    ).toBe('*')
  })

  describe('swaps', () => {
    it('stores what was used instead, and whether it was an offered candidate', async () => {
      await submitFeedback(ctx, 'res1', {
        sourceKey: 's1',
        verdict: 'swapped',
        swappedToUnitIds: ['ub']
      })
      expect(
        db.recommendationFeedback.upsert.mock.calls[0][0].create
      ).toMatchObject({
        verdict: 'swapped',
        swappedToUnitIds: ['ub'],
        swappedToModelSlugs: ['shure-sm57'],
        swappedToCandidate: true
      })
    })

    it('marks a swap to something the rules never offered', async () => {
      await submitFeedback(ctx, 'res1', {
        sourceKey: 's1',
        verdict: 'swapped',
        swappedToUnitIds: ['uc']
      })
      expect(
        db.recommendationFeedback.upsert.mock.calls[0][0].create
      ).toMatchObject({
        swappedToModelSlugs: ['shure-sm58'],
        swappedToCandidate: false
      })
    })

    it('needs exactly as many microphones as the source uses', async () => {
      await expect(
        submitFeedback(ctx, 'res1', {
          sourceKey: 's2',
          verdict: 'swapped',
          swappedToUnitIds: ['ub']
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        submitFeedback(ctx, 'res1', {
          sourceKey: 's1',
          verdict: 'swapped',
          swappedToUnitIds: ['ub', 'uc']
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('refuses the same unit twice in one swap', async () => {
      await expect(
        submitFeedback(ctx, 'res1', {
          sourceKey: 's2',
          verdict: 'swapped',
          swappedToUnitIds: ['ub', 'ub']
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it("treats another organisation's unit as not found", async () => {
      // tenantDb only returns this organisation's units; 'zz' is not one.
      await expect(
        submitFeedback(ctx, 'res1', {
          sourceKey: 's1',
          verdict: 'swapped',
          swappedToUnitIds: ['zz-theirs']
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(db.recommendationFeedback.upsert).not.toHaveBeenCalled()
    })

    it('says so when the "swap" is the microphone that was recommended', async () => {
      await expect(
        submitFeedback(ctx, 'res1', {
          sourceKey: 's1',
          verdict: 'swapped',
          swappedToUnitIds: ['ua']
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringMatching(/accepted/)
      })
    })
  })

  describe('what feedback may be about', () => {
    it("treats another organisation's recommendation as not found", async () => {
      db.recommendationResult.findFirst.mockResolvedValue(null)
      await expect(
        submitFeedback(ctx, 'theirs', { sourceKey: 's1', verdict: 'accepted' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(db.recommendationResult.findFirst.mock.calls[0][0].where).toEqual({
        id: 'theirs'
      })
      expect(db.recommendationFeedback.upsert).not.toHaveBeenCalled()
    })

    it('rejects a source that is not in the recommendation, or is a line source', async () => {
      for (const sourceKey of ['s9', 's3']) {
        await expect(
          submitFeedback(ctx, 'res1', { sourceKey, verdict: 'accepted' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      }
    })
  })

  it('needs permission to use AI, so a viewer cannot leave feedback', async () => {
    await expect(
      submitFeedback(viewer, 'res1', { sourceKey: 's1', verdict: 'accepted' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(db.recommendationResult.findFirst).not.toHaveBeenCalled()
  })

  it('validates before reading anything', async () => {
    await expect(
      submitFeedback(ctx, 'res1', { sourceKey: 's1', verdict: 'loved' })
    ).rejects.toThrow()
    await expect(
      submitFeedback(ctx, 'res1', {
        sourceKey: 's1',
        verdict: 'accepted',
        rating: 9
      })
    ).rejects.toThrow()
    expect(db.recommendationResult.findFirst).not.toHaveBeenCalled()
  })
})
