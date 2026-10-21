import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  releasePlatformRequest,
  reservePlatformRequest
} from '@/lib/ai/platform-cap'
import type { AiProvider, GenerateStructuredRequest } from '@/lib/ai/provider'
import { aiRateLimiter } from '@/lib/ai/rate-limit'
import { setAiProvider } from '@/lib/ai/registry'
import {
  recordAiTokens,
  releaseAiRequest,
  reserveAiRequest
} from '@/lib/ai/usage'
import { recordAudit } from '@/lib/audit'
import prisma from '@/lib/prisma'
import {
  createRecommendation,
  getRecommendation,
  listRecommendations,
  previewRecommendation
} from '@/lib/recommendations/service'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/ai/usage', () => ({
  reserveAiRequest: vi.fn(),
  releaseAiRequest: vi.fn(),
  recordAiTokens: vi.fn()
}))
vi.mock('@/lib/ai/platform-cap', () => ({
  reservePlatformRequest: vi.fn(),
  releasePlatformRequest: vi.fn(),
  recordPlatformTokens: vi.fn()
}))
vi.mock('@/lib/prisma', () => ({
  default: {
    microphoneModel: { findMany: vi.fn() },
    // Present only to prove the global cache is never used.
    aiSummary: { findUnique: vi.fn(), upsert: vi.fn() }
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

const catalogue = vi.mocked(prisma.microphoneModel, true)
const globalCache = vi.mocked(prisma.aiSummary, true)
let db: FakeDb

const ctx = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })

// ---------------------------------------------------------------------------
// Fixtures

const modelRow = (id: string, slug: string, overrides = {}) => ({
  id,
  slug,
  manufacturer: slug === 'neumann-u-87-ai' ? 'Neumann' : 'Shure',
  model: slug === 'neumann-u-87-ai' ? 'U 87 Ai' : 'SM57',
  transducerType: slug === 'neumann-u-87-ai' ? 'ldc' : 'dynamic',
  polarPatterns:
    slug === 'neumann-u-87-ai' ? ['omni', 'cardioid', 'figure8'] : ['cardioid'],
  powering: slug === 'neumann-u-87-ai' ? 'phantom' : 'none',
  phantomSafe: null,
  discontinued: false,
  freqRangeMinHz: null,
  freqRangeMaxHz: null,
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
  specConditions: null,
  status: 'published',
  ...overrides
})

const unitRow = (id: string, micModelId: string, overrides = {}) => ({
  id,
  micModelId,
  condition: 'good',
  matchedPairGroup: null,
  equipmentItem: {
    status: 'in_service',
    quantity: 1,
    roomId: null,
    room: null
  },
  ...overrides
})

let units: ReturnType<typeof unitRow>[]
let models: ReturnType<typeof modelRow>[]

const vocalAndSnare = {
  sources: [{ label: 'Lead vocal' }, { label: 'Snare' }]
}

// The model, replaced. Builds a reply that follows every rule from the
// session data in the message it was sent.
function validReply(message: string) {
  const start = message.indexOf('<session_data>') + '<session_data>'.length
  const data = JSON.parse(
    message.slice(start, message.indexOf('</session_data>'))
  )
  return {
    answerable: true,
    sources: data.sources.map(
      (s: {
        id: string
        rulesPick: string | null
        options: Array<{ id: string }>
        placement: { distanceMm: number[]; angleDeg: number[] }
        technique: {
          spacingMm: number[] | null
          includedAngleDeg: number[] | null
        }
      }) => ({
        sourceId: s.id,
        primary: {
          option: s.rulesPick ?? s.options[0].id,
          reasoning: 'Fits this source.',
          placement: {
            position: 'Aimed at the source',
            distanceMm: s.placement.distanceMm[0],
            angleDeg: s.placement.angleDeg[0],
            spacingMm: s.technique.spacingMm?.[0] ?? null,
            includedAngleDeg: s.technique.includedAngleDeg?.[0] ?? null
          }
        },
        alternatives: []
      })
    ),
    summary: null
  }
}

let replies: (message: string) => unknown
const sent: GenerateStructuredRequest<unknown>[] = []
const provider: AiProvider = {
  name: 'fake',
  costsMoney: true,
  async generateStructured<T>(request: GenerateStructuredRequest<T>) {
    sent.push(request as GenerateStructuredRequest<unknown>)
    const output = replies(request.messages[0].content)
    return {
      output,
      rawText: JSON.stringify(output),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'fake-model'
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sent.length = 0
  aiRateLimiter.reset()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)

  units = [unitRow('ua', 'm_u87'), unitRow('ub', 'm_sm57')]
  models = [
    modelRow('m_u87', 'neumann-u-87-ai'),
    modelRow('m_sm57', 'shure-sm57')
  ]
  db.microphoneUnit.findMany.mockImplementation((async (args?: {
    where?: { id?: { in: string[] } }
  }) =>
    args?.where?.id
      ? args.where.id.in.map((id) => ({
          id,
          equipmentItem: { status: 'in_service' }
        }))
      : units) as never)
  catalogue.findMany.mockImplementation((async (args: {
    where: { id?: unknown; status?: string }
  }) =>
    args.where.id
      ? models
      : [...models, { manufacturer: 'Neumann', model: 'U 47' }]) as never)
  db.recommendationResult.findFirst.mockResolvedValue(null)
  db.recommendationFeedback.findMany.mockResolvedValue([])
  db.recommendationRequest.create.mockImplementation((async (args: {
    data: {
      input: unknown
      rules: unknown
      results: { create: Record<string, unknown> }
    }
  }) => ({
    id: 'req1',
    input: args.data.input,
    rules: args.data.rules,
    results: [
      {
        id: 'res1',
        requestId: 'req1',
        promptVersion: args.data.results.create.promptVersion,
        model: args.data.results.create.model,
        final: args.data.results.create.final,
        adjustments: args.data.results.create.adjustments,
        createdAt: new Date('2026-10-20T10:00:00Z')
      }
    ]
  })) as never)

  replies = validReply
  setAiProvider(provider)
  vi.mocked(reserveAiRequest).mockResolvedValue('2026-10')
  vi.mocked(reservePlatformRequest).mockResolvedValue('2026-10-20')
})

afterEach(() => {
  setAiProvider(null)
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------

describe('previewRecommendation', () => {
  it('runs the rules for any member who can see inventory, and stores nothing', async () => {
    const preview = await previewRecommendation(viewer, vocalAndSnare)

    expect(preview.request.sources.map((s) => s.kind)).toEqual([
      'vocal_lead',
      'snare_top'
    ])
    expect(preview.rules.sources[0].planOptionId).not.toBeNull()
    expect(preview.unitNames).toEqual({
      ua: 'Neumann U 87 Ai',
      ub: 'Shure SM57'
    })
    expect(sent).toHaveLength(0)
    expect(reserveAiRequest).not.toHaveBeenCalled()
    expect(db.recommendationRequest.create).not.toHaveBeenCalled()
  })

  it('validates input before reading anything', async () => {
    await expect(previewRecommendation(ctx, {})).rejects.toThrow()
    expect(db.microphoneUnit.findMany).not.toHaveBeenCalled()
  })

  it("treats another organisation's room as not found", async () => {
    db.room.findFirst.mockResolvedValue(null)
    await expect(
      previewRecommendation(ctx, { ...vocalAndSnare, roomId: 'someone-elses' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('warns about units kept in a different studio from the room', async () => {
    db.room.findFirst.mockResolvedValue({
      id: 'r1',
      studioId: 'st1',
      name: 'Live room',
      widthMm: 5000,
      lengthMm: 7000,
      heightMm: 3000
    })
    units = [
      unitRow('ua', 'm_u87', {
        equipmentItem: {
          status: 'in_service',
          quantity: 1,
          roomId: 'x',
          room: { studioId: 'st2' }
        }
      })
    ]
    const preview = await previewRecommendation(ctx, {
      sources: [{ label: 'Lead vocal' }],
      roomId: 'r1'
    })
    const option = preview.rules.sources[0].candidates[0]
    expect(option.warnings.map((w) => w.code)).toContain('other_studio')
  })

  it('never offers a model that has been unpublished', async () => {
    models = [modelRow('m_u87', 'neumann-u-87-ai', { status: 'draft' })]
    units = [unitRow('ua', 'm_u87')]
    const preview = await previewRecommendation(ctx, {
      sources: [{ label: 'Lead vocal' }]
    })
    expect(preview.rules.sources[0].candidates).toEqual([])
    expect(preview.rules.excluded).toContainEqual({
      unitId: 'ua',
      reason: 'catalogue_unpublished'
    })
    expect(preview.unitNames).toEqual({})
  })
})

describe('createRecommendation', () => {
  it('needs permission to use AI, not just to see the inventory', async () => {
    await expect(
      createRecommendation(viewer, vocalAndSnare)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(sent).toHaveLength(0)
  })

  it('ranks with the model, finalises, stores in tenant tables and audits', async () => {
    const { recommendation, cached } = await createRecommendation(
      ctx,
      vocalAndSnare
    )

    expect(cached).toBe(false)
    expect(sent).toHaveLength(1)
    expect(recommendation).toMatchObject({
      id: 'res1',
      requestId: 'req1',
      model: 'fake-model',
      promptVersion: '1'
    })
    expect(
      recommendation?.view.sources.map((s) => s.primary?.units[0].name)
    ).toEqual(['Neumann U 87 Ai', 'Shure SM57'])

    const data = db.recommendationRequest.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      organisationId: 'org_1',
      createdById: 'user_1',
      kind: 'sources',
      rulesVersion: '1',
      profilesVersion: '1'
    })
    expect(data.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(data.locker).toMatchObject({ units: expect.any(Array) })
    expect(data.aliases).toMatchObject({ options: expect.any(Object) })
    // The nested result names its organisation, because tenantDb cannot scope
    // nested writes.
    expect(data.results.create).toMatchObject({
      organisationId: 'org_1',
      promptVersion: '1',
      model: 'fake-model',
      inputTokens: 100,
      outputTokens: 50
    })
    expect(recordAudit).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: 'recommendation.create',
        entityType: 'recommendation',
        entityId: 'res1'
      })
    )
    expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
      inputTokens: 100,
      outputTokens: 50
    })
  })

  it('never reads or writes the global AI cache', async () => {
    await createRecommendation(ctx, vocalAndSnare)
    expect(globalCache.findUnique).not.toHaveBeenCalled()
    expect(globalCache.upsert).not.toHaveBeenCalled()
  })

  it('keeps ids, slugs and unowned names out of what the model is sent', async () => {
    await createRecommendation(ctx, vocalAndSnare)
    const message = sent[0].messages[0].content
    for (const secret of [
      '"ua"',
      '"ub"',
      'neumann-u-87-ai',
      'shure-sm57',
      'U 47'
    ]) {
      expect(message, secret).not.toContain(secret)
    }
    expect(sent[0].system).not.toContain('Neumann')
  })

  it('answers a free-text question through the same pipeline', async () => {
    const { recommendation } = await createRecommendation(ctx, {
      question: 'Which of my mics would suit a breathy female vocal?'
    })
    expect(sent[0].messages[0].content).toContain(
      'Which of my mics would suit a breathy female vocal?'
    )
    expect(recommendation?.request.kind).toBe('question')
    // A vocal question prefers the large-diaphragm condenser.
    expect(recommendation?.view.sources[0].primary?.units[0].name).toBe(
      'Neumann U 87 Ai'
    )
    expect(db.recommendationRequest.create.mock.calls[0][0].data.kind).toBe(
      'question'
    )
  })

  it('calls no model and spends nothing when there is nothing to rank', async () => {
    units = []
    const { recommendation, preview, cached } = await createRecommendation(
      ctx,
      vocalAndSnare
    )
    expect(recommendation).toBeNull()
    expect(cached).toBe(false)
    expect(preview.rules.sources.map((s) => s.unfillable)).toEqual([
      'no_suitable_mic',
      'no_suitable_mic'
    ])
    expect(sent).toHaveLength(0)
    expect(reserveAiRequest).not.toHaveBeenCalled()
    expect(reservePlatformRequest).not.toHaveBeenCalled()
    expect(db.recommendationRequest.create).not.toHaveBeenCalled()
  })

  it('does not ask the model about line sources', async () => {
    const { recommendation } = await createRecommendation(ctx, {
      sources: [{ label: 'Bass DI' }, { label: 'Lead vocal' }]
    })
    const message = sent[0].messages[0].content
    expect(message).not.toContain('"id": "s1"')
    expect(recommendation?.view.sources[0]).toMatchObject({
      line: true,
      primary: null
    })
  })

  it('serves an earlier answer to the same request for free', async () => {
    const first = await createRecommendation(ctx, vocalAndSnare)
    // What the first call wrote is what the lookup now finds.
    const written = await db.recommendationRequest.create.mock.results[0].value
    db.recommendationResult.findFirst.mockResolvedValue({
      ...written.results[0],
      request: { input: written.input, rules: written.rules }
    })
    sent.length = 0
    vi.mocked(reserveAiRequest).mockClear()
    vi.mocked(recordAudit).mockClear()
    db.recommendationRequest.create.mockClear()

    const again = await createRecommendation(ctx, vocalAndSnare)

    expect(again.cached).toBe(true)
    expect(again.recommendation?.id).toBe(first.recommendation?.id)
    expect(again.recommendation?.view).toEqual(first.recommendation?.view)
    expect(sent).toHaveLength(0)
    expect(reserveAiRequest).not.toHaveBeenCalled()
    expect(db.recommendationRequest.create).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('looks for earlier answers only inside the organisation, by hash and prompt version', async () => {
    await createRecommendation(ctx, vocalAndSnare)
    const query = db.recommendationResult.findFirst.mock.calls[0][0]
    expect(query.where).toMatchObject({
      promptVersion: '1',
      request: { inputHash: expect.stringMatching(/^[0-9a-f]{64}$/) }
    })
    // tenantDb is what adds organisationId; the plain client is never used.
    expect(tenantDb).toHaveBeenCalledWith(ctx)
  })

  it('asks again, and spends, when told to regenerate', async () => {
    db.recommendationResult.findFirst.mockResolvedValue({ id: 'old' })
    await createRecommendation(ctx, vocalAndSnare, { regenerate: true })
    expect(db.recommendationResult.findFirst).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(reserveAiRequest).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        metadata: expect.objectContaining({ regenerated: true })
      })
    )
  })

  it('misses when the locker changes', async () => {
    await createRecommendation(ctx, vocalAndSnare)
    const firstHash =
      db.recommendationRequest.create.mock.calls[0][0].data.inputHash
    units = [unitRow('ua', 'm_u87')]
    await createRecommendation(ctx, vocalAndSnare)
    const secondHash =
      db.recommendationRequest.create.mock.calls[1][0].data.inputHash
    expect(secondHash).not.toBe(firstHash)
  })

  describe('when the reply is not acceptable', () => {
    it('retries once with the problems, then fails closed and stores nothing', async () => {
      replies = (message) => {
        const reply = validReply(message)
        // An option that does not exist.
        reply.sources[0].primary.option = 'c99'
        return reply
      }
      await expect(
        createRecommendation(ctx, vocalAndSnare)
      ).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE'
      })
      expect(sent).toHaveLength(2)
      expect(sent[1].messages.at(-1)?.content).toContain('c99')
      expect(db.recommendationRequest.create).not.toHaveBeenCalled()
      expect(recordAudit).not.toHaveBeenCalled()
      expect(releaseAiRequest).toHaveBeenCalledTimes(1)
      expect(releasePlatformRequest).toHaveBeenCalledTimes(1)
      // The tokens were still spent.
      expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
        inputTokens: 200,
        outputTokens: 100
      })
    })

    it('drops a mic that is not owned: naming one is rejected, not shown', async () => {
      let attempt = 0
      replies = (message) => {
        const reply = validReply(message)
        if (attempt++ === 0) {
          reply.sources[0].primary.reasoning = 'A Neumann U 47 would be nicer.'
        }
        return reply
      }
      const { recommendation } = await createRecommendation(ctx, vocalAndSnare)
      expect(sent).toHaveLength(2)
      expect(JSON.stringify(recommendation)).not.toContain('U 47')
    })

    it('hands the request back and stores nothing if saving fails', async () => {
      db.recommendationRequest.create.mockRejectedValue(new Error('db down'))
      await expect(createRecommendation(ctx, vocalAndSnare)).rejects.toThrow(
        'db down'
      )
      expect(releaseAiRequest).toHaveBeenCalledTimes(1)
      expect(recordAudit).not.toHaveBeenCalled()
    })

    it('repairs two sources choosing the same unit instead of rejecting the reply', async () => {
      replies = (message) => {
        const reply = validReply(message)
        const data = JSON.parse(
          message.slice(
            message.indexOf('<session_data>') + 14,
            message.indexOf('</session_data>')
          )
        )
        // Point the second source at the option that uses the U 87, which the
        // first source already has. Each id is valid for its own source, so
        // validation passes and finalise has to resolve the clash.
        const u87 = data.mics.find(
          (m: { name: string }) => m.name === 'Neumann U 87 Ai'
        ).id
        reply.sources[1].primary.option = data.sources[1].options.find(
          (o: { units: Array<{ mic: string }> }) => o.units[0].mic === u87
        ).id
        return reply
      }
      const { recommendation } = await createRecommendation(ctx, {
        sources: [{ label: 'Lead vocal' }, { label: 'Backing vocal' }]
      })
      expect(sent).toHaveLength(1)
      const [first, second] = recommendation!.view.sources
      expect(first.primary?.units[0].unitId).toBe('ua')
      expect(second.primary).toMatchObject({
        origin: 'rules',
        units: [{ unitId: 'ub' }]
      })
      expect(recommendation!.adjustments).toEqual([
        expect.objectContaining({ sourceId: 's2', reason: 'unit_in_use' })
      ])
    })
  })

  it('refuses more sources than the model can rank in one reply', async () => {
    units = Array.from({ length: 20 }, (_, i) => unitRow(`u${i}`, 'm_sm57'))
    await expect(
      createRecommendation(ctx, {
        sources: Array.from({ length: 17 }, (_, i) => ({ label: `Tom ${i}` }))
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(sent).toHaveLength(0)
    expect(reserveAiRequest).not.toHaveBeenCalled()
  })

  it('runs 16 sources', async () => {
    units = Array.from({ length: 20 }, (_, i) => unitRow(`u${i}`, 'm_sm57'))
    const { recommendation } = await createRecommendation(ctx, {
      sources: Array.from({ length: 16 }, (_, i) => ({ label: `Tom ${i}` }))
    })
    expect(recommendation?.view.sources).toHaveLength(16)
  })

  it('reports AI being switched off without touching anything', async () => {
    setAiProvider(null)
    vi.stubEnv('AI_ENABLED', 'false')
    await expect(
      createRecommendation(ctx, vocalAndSnare)
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE'
    })
    expect(db.recommendationRequest.create).not.toHaveBeenCalled()
    expect(reserveAiRequest).not.toHaveBeenCalled()
  })
})

describe('getRecommendation and listRecommendations', () => {
  const finalView = {
    answerable: true,
    summary: null,
    warnings: [],
    sources: [
      {
        sourceId: 's1',
        label: 'Lead vocal',
        kind: 'vocal_lead',
        technique: 'mono',
        micCount: 1,
        line: false,
        unfillable: null,
        primary: {
          optionId: 's1-1',
          origin: 'ai',
          reasoning: 'Fits.',
          placement: null,
          matchedGroup: null,
          warnings: [],
          units: [
            {
              unitId: 'ua',
              micSlug: 'neumann-u-87-ai',
              name: 'Neumann U 87 Ai',
              role: 'single',
              patternSetting: 'cardioid'
            }
          ]
        },
        alternatives: [],
        rulesPickOptionId: 's1-1',
        adjusted: null
      }
    ]
  }
  const stored = {
    id: 'res1',
    requestId: 'req1',
    promptVersion: '1',
    model: 'fake-model',
    final: finalView,
    adjustments: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    request: {
      input: {
        kind: 'sources',
        sources: [
          {
            id: 's1',
            label: 'Lead vocal',
            kind: 'vocal_lead',
            technique: 'mono'
          }
        ],
        question: null
      },
      rules: { sources: [] }
    }
  }

  it('lets a viewer read a stored recommendation, with feedback only from themselves', async () => {
    db.recommendationResult.findFirst.mockResolvedValue(stored)
    db.recommendationFeedback.findMany.mockResolvedValue([
      {
        sourceKey: 's1',
        verdict: 'accepted',
        swappedToUnitIds: [],
        swappedToModelSlugs: [],
        swappedToCandidate: null,
        rating: 4,
        reasons: [],
        comment: null,
        updatedAt: new Date('2026-10-20T11:00:00Z')
      }
    ])
    const detail = await getRecommendation(viewer, 'res1')
    expect(detail.view.sources[0].primary?.units[0].name).toBe(
      'Neumann U 87 Ai'
    )
    expect(detail.feedback).toEqual([
      expect.objectContaining({
        sourceKey: 's1',
        verdict: 'accepted',
        rating: 4
      })
    ])
    expect(db.recommendationFeedback.findMany.mock.calls[0][0].where).toEqual({
      resultId: 'res1',
      userId: 'user_1'
    })
  })

  it('shows where each unit stands now', async () => {
    db.recommendationResult.findFirst.mockResolvedValue(stored)
    db.microphoneUnit.findMany.mockResolvedValue([])
    expect((await getRecommendation(ctx, 'res1')).unitState).toEqual({
      ua: 'removed'
    })
    db.microphoneUnit.findMany.mockResolvedValue([
      { id: 'ua', equipmentItem: { status: 'repair' } }
    ] as never)
    expect((await getRecommendation(ctx, 'res1')).unitState).toEqual({
      ua: 'unavailable'
    })
    db.microphoneUnit.findMany.mockResolvedValue([
      { id: 'ua', equipmentItem: { status: 'in_service' } }
    ] as never)
    expect((await getRecommendation(ctx, 'res1')).unitState).toEqual({
      ua: 'available'
    })
  })

  it('treats a recommendation from another organisation as not found', async () => {
    db.recommendationResult.findFirst.mockResolvedValue(null)
    await expect(getRecommendation(ctx, 'theirs')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
    expect(db.recommendationResult.findFirst.mock.calls[0][0].where).toEqual({
      id: 'theirs'
    })
  })

  it('lists newest first with a short title', async () => {
    db.recommendationResult.findMany.mockResolvedValue([
      {
        id: 'res2',
        createdAt: new Date('2026-10-20T10:00:00Z'),
        request: {
          input: {
            kind: 'sources',
            sources: ['Kick', 'Snare', 'Tom', 'Hat', 'OH'].map((label, i) => ({
              id: `s${i + 1}`,
              label
            })),
            question: null
          }
        }
      },
      {
        id: 'res1',
        createdAt: new Date('2026-10-19T10:00:00Z'),
        request: {
          input: {
            kind: 'question',
            sources: [{ id: 's1', label: 'Your question' }],
            question: 'Which mic for a banjo?'
          }
        }
      }
    ])
    const list = await listRecommendations(viewer, 500)
    expect(list.map((r) => r.title)).toEqual([
      'Kick, Snare, Tom and 2 more',
      'Which mic for a banjo?'
    ])
    expect(db.recommendationResult.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  })
})
