import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as usageRoute } from '@/app/api/ai/usage/route'
import {
  GET as getSummary,
  POST as postSummary
} from '@/app/api/mics/[micId]/summary/route'
import {
  GET as getCompare,
  POST as postCompare
} from '@/app/api/mics/compare/route'
import type { AiProvider, GenerateStructuredRequest } from '@/lib/ai/provider'
import { aiRateLimiter } from '@/lib/ai/rate-limit'
import { setAiProvider } from '@/lib/ai/registry'
import { unauthorized } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers + real src/lib + real prompts, with the
// session, databases and the model replaced.

vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn
}))
vi.mock('@/lib/prisma', () => ({
  default: {
    microphoneModel: { findFirst: vi.fn() },
    aiSummary: { findUnique: vi.fn(), upsert: vi.fn() },
    aiPlatformUsage: { upsert: vi.fn(), updateMany: vi.fn() }
  }
}))

const catalogue = vi.mocked(prisma.microphoneModel, true)
const summaries = vi.mocked(prisma.aiSummary, true)
const platform = vi.mocked(prisma.aiPlatformUsage, true)
let db: FakeDb

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const plain = (url = 'http://localhost/api') => new Request(url)
const json = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

function rawMic(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id_${slug}`,
    slug,
    manufacturer: 'Shure',
    model: slug === 'shure-sm57' ? 'SM57' : 'SM7B',
    transducerType: 'dynamic',
    polarPatterns: ['cardioid'],
    powering: 'none',
    phantomSafe: null,
    discontinued: false,
    status: 'published',
    freqRangeMinHz: 40,
    freqRangeMaxHz: 15000,
    sensitivityMvPa: 1.6,
    selfNoiseDbA: null,
    maxSplDb: null,
    impedanceOhm: 310,
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
    fieldProvenance: [],
    ...overrides
  }
}

const published: Record<string, ReturnType<typeof rawMic>> = {
  'shure-sm57': rawMic('shure-sm57'),
  'shure-sm7b': rawMic('shure-sm7b')
}

// The model, replaced. Returns whatever `reply` currently says.
let reply: (request: GenerateStructuredRequest<unknown>) => unknown
const provider: AiProvider & { calls: number } = {
  name: 'fake',
  costsMoney: true,
  calls: 0,
  async generateStructured(request) {
    provider.calls++
    const output = reply(request as GenerateStructuredRequest<unknown>)
    return {
      output,
      rawText: JSON.stringify(output),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'fake-model'
    }
  }
}

const goodSummary = {
  headline: 'A rugged dynamic cardioid',
  overview: 'A dynamic microphone covering 40 Hz to 15,000 Hz.',
  strengths: ['Tolerates close miking'],
  limitations: ['Self-noise is not recorded'],
  bestFor: ['Snare']
}
const goodComparison = {
  overview: 'Two dynamic microphones.',
  keyDifferences: ['Both are dynamic cardioids.'],
  perMic: [
    { slug: 'shure-sm57', strengths: ['Tough'], limitations: [] },
    { slug: 'shure-sm7b', strengths: ['Smooth'], limitations: [] }
  ],
  whichToUseWhen: [
    { scenario: 'Snare', pick: 'shure-sm57', reason: 'Close miking.' },
    { scenario: 'Voice-over', pick: 'shure-sm7b', reason: 'Broadcast use.' }
  ]
}

// In-memory stand-in for the global AiSummary table.
let store: Map<string, { model: string; content: unknown; createdAt: Date }>
const keyOf = (w: {
  kind_inputHash_promptVersion: {
    kind: string
    inputHash: string
    promptVersion: string
  }
}) => JSON.stringify(w.kind_inputHash_promptVersion)

function signInAs(role: MemberRole, overrides = {}) {
  vi.mocked(getTenantContext).mockResolvedValue(
    makeContext({ role, ...overrides })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  aiRateLimiter.reset()
  provider.calls = 0
  reply = () => goodSummary
  setAiProvider(provider)
  db = makeFakeDb()
  db.aiUsage.upsert.mockResolvedValue({ requests: 1 })
  platform.upsert.mockResolvedValue({ requests: 1 } as never)
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)

  catalogue.findFirst.mockImplementation((async (args: {
    where: { OR: Array<{ slug?: string; id?: string }> }
  }) => {
    const ref = args.where.OR[1]?.slug ?? args.where.OR[0]?.id
    return (
      Object.values(published).find((m) => m.slug === ref || m.id === ref) ??
      null
    )
  }) as never)

  store = new Map()
  summaries.findUnique.mockImplementation((async (args: { where: never }) => {
    const row = store.get(keyOf(args.where))
    return row ?? null
  }) as never)
  summaries.upsert.mockImplementation((async (args: {
    where: never
    create: { model: string; content: unknown }
  }) => {
    const row = {
      model: args.create.model,
      content: args.create.content,
      createdAt: new Date('2026-10-08T09:00:00Z')
    }
    store.set(keyOf(args.where), row)
    return row
  }) as never)
})

describe('/api/mics/[micId]/summary', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await getSummary(plain(), params({ micId: 'x' }))).status).toBe(401)
    expect((await postSummary(plain(), params({ micId: 'x' }))).status).toBe(
      401
    )
  })

  it('GET returns null before anything is generated, and never calls the model', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await getSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(200)
    expect((await response.json()).summary).toBeNull()
    expect(provider.calls).toBe(0)
  })

  it('POST generates, caches and records usage; the next GET is free', async () => {
    const created = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(created.status).toBe(200)
    const { summary } = await created.json()
    expect(summary).toMatchObject({
      content: goodSummary,
      model: 'fake-model',
      cached: false
    })
    expect(provider.calls).toBe(1)
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1)

    signInAs(MemberRole.VIEWER)
    const read = await getSummary(plain(), params({ micId: 'shure-sm57' }))
    expect((await read.json()).summary).toMatchObject({
      content: goodSummary,
      cached: true
    })
    expect(provider.calls).toBe(1)
  })

  it('POST serves the cache without spending allowance or rate limit', async () => {
    await postSummary(plain(), params({ micId: 'shure-sm57' }))
    for (let i = 0; i < 15; i++) {
      const response = await postSummary(
        plain(),
        params({ micId: 'shure-sm57' })
      )
      expect(response.status).toBe(200)
    }
    expect(provider.calls).toBe(1)
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1)
  })

  it('shares one generation between organisations (the cache is global)', async () => {
    await postSummary(plain(), params({ micId: 'shure-sm57' }))
    signInAs(MemberRole.OWNER, { organisationId: 'org_2' })
    const second = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect((await second.json()).summary.cached).toBe(true)
    expect(provider.calls).toBe(1)
    // Only the organisation that triggered the generation was charged.
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1)
  })

  it('regenerates when the specs in the catalogue change', async () => {
    await postSummary(plain(), params({ micId: 'shure-sm57' }))
    published['shure-sm57'] = rawMic('shure-sm57', { maxSplDb: 150 })
    const read = await getSummary(plain(), params({ micId: 'shure-sm57' }))
    expect((await read.json()).summary).toBeNull()
    reply = () => ({
      ...goodSummary,
      overview: 'Now with a stated 150 dB SPL limit.'
    })
    await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(provider.calls).toBe(2)
    published['shure-sm57'] = rawMic('shure-sm57')
  })

  it('403s a viewer generating, but lets them read', async () => {
    signInAs(MemberRole.VIEWER)
    expect(
      (await postSummary(plain(), params({ micId: 'shure-sm57' }))).status
    ).toBe(403)
    expect(provider.calls).toBe(0)
    expect(db.aiUsage.upsert).not.toHaveBeenCalled()
  })

  it('404s an unpublished or unknown mic without touching the model', async () => {
    const response = await postSummary(plain(), params({ micId: 'draft-mic' }))
    expect(response.status).toBe(404)
    expect(provider.calls).toBe(0)
  })

  it('refuses an invented number, retries, then fails closed with a 503', async () => {
    reply = () => ({ ...goodSummary, overview: 'Needs 48 V of phantom power.' })
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('AI_UNAVAILABLE')
    expect(provider.calls).toBe(2)
    expect(store.size).toBe(0)
    // The user got nothing, so the request is handed back.
    expect(db.aiUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { requests: { decrement: 1 } } })
    )
  })

  it('succeeds on the retry when the second reply is grounded', async () => {
    let n = 0
    reply = () =>
      n++ === 0
        ? { ...goodSummary, overview: 'Needs 48 V of phantom power.' }
        : goodSummary
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(200)
    expect(provider.calls).toBe(2)
  })

  it('returns PLAN_LIMIT (403) once the monthly allowance is spent', async () => {
    signInAs(MemberRole.OWNER, { planTier: PlanTier.FREE })
    db.aiUsage.upsert.mockResolvedValue({ requests: 26 })
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('PLAN_LIMIT')
    expect(body.details).toEqual({
      resource: 'AI requests this month',
      limit: 25
    })
    expect(provider.calls).toBe(0)
  })

  it('429s with Retry-After when an organisation fires too fast', async () => {
    let status = 200
    let retryAfter: string | null = null
    for (let i = 0; i < 12; i++) {
      // A distinct input each time so nothing is served from the cache.
      published['shure-sm57'] = rawMic('shure-sm57', { maxSplDb: 100 + i })
      reply = () => goodSummary
      const response = await postSummary(
        plain(),
        params({ micId: 'shure-sm57' })
      )
      status = response.status
      retryAfter = response.headers.get('Retry-After')
      if (status === 429) break
    }
    published['shure-sm57'] = rawMic('shure-sm57')
    expect(status).toBe(429)
    expect(Number(retryAfter)).toBeGreaterThan(0)
  })

  it('503s without calling the model once the platform daily cap is reached', async () => {
    vi.stubEnv('AI_DAILY_REQUEST_CAP', '5')
    platform.upsert.mockResolvedValue({ requests: 6 } as never)
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/daily usage limit/)
    expect(provider.calls).toBe(0)
    expect(platform.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { requests: { decrement: 1 } } })
    )
    // Neither budget stays charged.
    expect(db.aiUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { requests: { decrement: 1 } } })
    )
    vi.unstubAllEnvs()
  })

  it('does not touch the platform cap for a free local provider', async () => {
    setAiProvider({ ...provider, costsMoney: false })
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(200)
    expect(platform.upsert).not.toHaveBeenCalled()
  })

  it('serves cached output but cannot generate new output when AI is switched off', async () => {
    await postSummary(plain(), params({ micId: 'shure-sm57' }))
    vi.stubEnv('AI_ENABLED', 'false')
    const cached = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(cached.status).toBe(200)
    published['shure-sm57'] = rawMic('shure-sm57', { maxSplDb: 140 })
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    published['shure-sm57'] = rawMic('shure-sm57')
    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/switched off/)
    vi.unstubAllEnvs()
  })

  it('503s without calling anything when AI is not configured', async () => {
    setAiProvider(null)
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const response = await postSummary(plain(), params({ micId: 'shure-sm57' }))
    expect(response.status).toBe(503)
    expect(db.aiUsage.upsert).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

describe('/api/mics/compare', () => {
  const url = (mics: string) =>
    plain(`http://localhost/api/mics/compare?mics=${mics}`)

  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await getCompare(url('a,b'))).status).toBe(401)
    expect((await postCompare(json({ mics: ['a', 'b'] }))).status).toBe(401)
  })

  it('GET returns null until generated', async () => {
    const response = await getCompare(url('shure-sm57,shure-sm7b'))
    expect(response.status).toBe(200)
    expect((await response.json()).comparison).toBeNull()
  })

  it('POST generates and then GET serves it from the cache in either order', async () => {
    reply = () => goodComparison
    const created = await postCompare(
      json({ mics: ['shure-sm57', 'shure-sm7b'] })
    )
    expect(created.status).toBe(200)
    expect((await created.json()).comparison).toMatchObject({
      content: goodComparison,
      cached: false
    })

    const reversed = await getCompare(url('shure-sm7b,shure-sm57'))
    expect((await reversed.json()).comparison).toMatchObject({ cached: true })
    expect(provider.calls).toBe(1)
  })

  it('rejects a pick that is not one of the compared mics', async () => {
    reply = () => ({
      ...goodComparison,
      whichToUseWhen: [
        { scenario: 'Snare', pick: 'akg-d112', reason: 'Low end.' },
        goodComparison.whichToUseWhen[1]
      ]
    })
    const response = await postCompare(
      json({ mics: ['shure-sm57', 'shure-sm7b'] })
    )
    expect(response.status).toBe(503)
    expect(store.size).toBe(0)
  })

  it('400s on fewer than 2 or more than 4 mics', async () => {
    expect((await postCompare(json({ mics: ['shure-sm57'] }))).status).toBe(400)
    expect(
      (await postCompare(json({ mics: ['a', 'b', 'c', 'd', 'e'] }))).status
    ).toBe(400)
    expect((await postCompare(json({}))).status).toBe(400)
    expect((await getCompare(url('shure-sm57'))).status).toBe(400)
    expect(provider.calls).toBe(0)
  })

  it('404s when any mic is unpublished or unknown', async () => {
    const response = await postCompare(
      json({ mics: ['shure-sm57', 'draft-mic'] })
    )
    expect(response.status).toBe(404)
    expect(provider.calls).toBe(0)
  })

  it('403s a viewer generating', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await postCompare(
      json({ mics: ['shure-sm57', 'shure-sm7b'] })
    )
    expect(response.status).toBe(403)
    expect(provider.calls).toBe(0)
  })
})

describe('/api/ai/usage', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await usageRoute()).status).toBe(401)
  })

  it("reports the caller's own organisation only", async () => {
    signInAs(MemberRole.VIEWER, {
      organisationId: 'org_7',
      planTier: PlanTier.PRO
    })
    db.aiUsage.findFirst.mockResolvedValue({
      requests: 12,
      inputTokens: 900,
      outputTokens: 300
    })
    const response = await usageRoute()
    expect(response.status).toBe(200)
    expect((await response.json()).usage).toMatchObject({
      requests: 12,
      limit: 400,
      remaining: 388
    })
    expect(tenantDb).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: 'org_7' })
    )
  })
})
