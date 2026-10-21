import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PUT as putFeedback } from '@/app/api/recommendations/[recommendationId]/feedback/route'
import { GET as getOne } from '@/app/api/recommendations/[recommendationId]/route'
import { POST as postPreview } from '@/app/api/recommendations/preview/route'
import {
  GET as listRoute,
  POST as postCreate
} from '@/app/api/recommendations/route'
import type { AiProvider, GenerateStructuredRequest } from '@/lib/ai/provider'
import { aiRateLimiter } from '@/lib/ai/rate-limit'
import { setAiProvider } from '@/lib/ai/registry'
import { unauthorized } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers + real src/lib + the real prompt, with the
// session, the databases and the model replaced. The tenant database is an
// in-memory store that filters by organisation, so the cross-organisation
// tests prove isolation rather than assume it.

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
    microphoneModel: { findMany: vi.fn() },
    aiSummary: { findUnique: vi.fn(), upsert: vi.fn() },
    aiPlatformUsage: { upsert: vi.fn(), updateMany: vi.fn() }
  }
}))

const catalogue = vi.mocked(prisma.microphoneModel, true)
const platform = vi.mocked(prisma.aiPlatformUsage, true)
const globalCache = vi.mocked(prisma.aiSummary, true)

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const plain = (url = 'http://localhost/api') => new Request(url)
const send = (method: string, body: unknown) =>
  new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

// ---------------------------------------------------------------------------
// In-memory tenant store

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
interface Store {
  units: Row[]
  rooms: Row[]
  requests: Row[]
  results: Row[]
  feedback: Row[]
}
let store: Store
let counter: number

function dbFor(organisationId: string) {
  const db = makeFakeDb()
  const mine = (rows: Row[]) =>
    rows.filter((r) => r.organisationId === organisationId)

  db.aiUsage.upsert.mockResolvedValue({ requests: 1 })
  db.microphoneUnit.findMany.mockImplementation(async (args?: Row) => {
    const rows = mine(store.units)
    const ids: string[] | undefined = args?.where?.id?.in
    return ids ? rows.filter((r) => ids.includes(r.id)) : rows
  })
  db.room.findFirst.mockImplementation(
    async (args: Row) =>
      mine(store.rooms).find((r) => r.id === args.where.id) ?? null
  )
  db.recommendationRequest.create.mockImplementation(async (args: Row) => {
    const { data } = args
    const n = ++counter
    const request = {
      id: `req_${n}`,
      organisationId: data.organisationId,
      input: data.input,
      rules: data.rules,
      inputHash: data.inputHash
    }
    const result = {
      id: `res_${n}`,
      organisationId: data.results.create.organisationId,
      requestId: request.id,
      promptVersion: data.results.create.promptVersion,
      model: data.results.create.model,
      final: data.results.create.final,
      adjustments: data.results.create.adjustments,
      createdAt: new Date(`2026-10-20T10:00:0${n % 10}Z`)
    }
    store.requests.push(request)
    store.results.push(result)
    return { ...request, results: [result] }
  })
  const join = (result: Row): Row => {
    const request = store.requests.find((r) => r.id === result.requestId)!
    return {
      ...result,
      request: { input: request.input, rules: request.rules }
    }
  }
  db.recommendationResult.findFirst.mockImplementation(async (args: Row) => {
    const { where } = args
    const found = mine(store.results).find((r) => {
      if (where.id && r.id !== where.id) return false
      if (where.promptVersion && r.promptVersion !== where.promptVersion) {
        return false
      }
      if (where.request?.inputHash) {
        const request = store.requests.find((q) => q.id === r.requestId)
        if (request?.inputHash !== where.request.inputHash) return false
      }
      return true
    })
    return found ? join(found) : null
  })
  db.recommendationResult.findMany.mockImplementation(async () =>
    mine(store.results)
      .map(join)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  )
  db.recommendationFeedback.findMany.mockImplementation(async (args: Row) =>
    mine(store.feedback).filter(
      (f) =>
        f.resultId === args.where.resultId && f.userId === args.where.userId
    )
  )
  db.recommendationFeedback.upsert.mockImplementation(async (args: Row) => {
    const key = args.where.resultId_sourceKey_userId
    const existing = mine(store.feedback).find(
      (f) =>
        f.resultId === key.resultId &&
        f.sourceKey === key.sourceKey &&
        f.userId === key.userId
    )
    if (existing) {
      Object.assign(existing, args.update, { updatedAt: new Date() })
      return existing
    }
    const row = { ...args.create, updatedAt: new Date() }
    store.feedback.push(row)
    return row
  })
  return db
}

// ---------------------------------------------------------------------------
// Catalogue and fixtures

const modelRow = (
  id: string,
  slug: string,
  make: string,
  name: string,
  extra = {}
) => ({
  id,
  slug,
  manufacturer: make,
  model: name,
  transducerType: 'dynamic',
  polarPatterns: ['cardioid'],
  powering: 'none',
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
  ...extra
})
const models = [
  modelRow('m_u87', 'neumann-u-87-ai', 'Neumann', 'U 87 Ai', {
    transducerType: 'ldc',
    polarPatterns: ['omni', 'cardioid', 'figure8'],
    powering: 'phantom'
  }),
  modelRow('m_sm57', 'shure-sm57', 'Shure', 'SM57')
]

const unit = (organisationId: string, id: string, micModelId: string) => ({
  organisationId,
  id,
  micModelId,
  condition: 'good',
  matchedPairGroup: null,
  equipmentItem: { status: 'in_service', quantity: 1, roomId: null, room: null }
})

const body = { sources: [{ label: 'Lead vocal' }, { label: 'Snare' }] }

let replies: (message: string) => unknown
const provider: AiProvider & { calls: number } = {
  name: 'fake',
  costsMoney: true,
  calls: 0,
  async generateStructured<T>(request: GenerateStructuredRequest<T>) {
    provider.calls++
    const output = replies(request.messages[0].content)
    return {
      output,
      rawText: JSON.stringify(output),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'fake-model'
    }
  }
}

function validReply(message: string) {
  const start = message.indexOf('<session_data>') + '<session_data>'.length
  const data = JSON.parse(
    message.slice(start, message.indexOf('</session_data>'))
  )
  return {
    answerable: true,
    sources: data.sources.map((s: Row) => ({
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
    })),
    summary: null
  }
}

function signInAs(role: MemberRole, overrides = {}) {
  vi.mocked(getTenantContext).mockResolvedValue(
    makeContext({ role, ...overrides })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  aiRateLimiter.reset()
  counter = 0
  provider.calls = 0
  replies = validReply
  setAiProvider(provider)
  platform.upsert.mockResolvedValue({ requests: 1 } as never)
  store = {
    units: [
      unit('org_1', 'ua', 'm_u87'),
      unit('org_1', 'ub', 'm_sm57'),
      unit('org_2', 'ux', 'm_sm57')
    ],
    rooms: [
      {
        organisationId: 'org_2',
        id: 'room_theirs',
        studioId: 'st',
        name: 'Theirs',
        widthMm: 4000,
        lengthMm: 5000,
        heightMm: null
      }
    ],
    requests: [],
    results: [],
    feedback: []
  }
  vi.mocked(tenantDb).mockImplementation(((ctx: { organisationId: string }) =>
    dbFor(ctx.organisationId)) as never)
  catalogue.findMany.mockImplementation((async (args: Row) =>
    args.where.id
      ? models
      : [...models, { manufacturer: 'Neumann', model: 'U 47' }]) as never)
  signInAs(MemberRole.OWNER)
})

// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('401s on every endpoint when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    const id = params({ recommendationId: 'x' })
    const responses = await Promise.all([
      listRoute(plain()),
      postCreate(send('POST', body)),
      postPreview(send('POST', body)),
      getOne(plain(), id),
      putFeedback(send('PUT', { sourceKey: '*', verdict: 'accepted' }), id)
    ])
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401])
  })
})

describe('POST /api/recommendations/preview', () => {
  it('gives the rules-based answer to anyone who can see inventory, and stores nothing', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await postPreview(send('POST', body))
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview.rules.sources).toHaveLength(2)
    expect(preview.rules.sources[0].planOptionId).toBe('s1-1')
    expect(provider.calls).toBe(0)
    expect(store.results).toEqual([])
  })

  it('400s with field paths on bad input', async () => {
    const response = await postPreview(
      send('POST', { sources: [{ label: '' }], channels: 0 })
    )
    expect(response.status).toBe(400)
    const { details } = await response.json()
    expect(details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['sources.0.label', 'channels'])
    )
  })

  it('400s for a technique the source cannot use', async () => {
    const response = await postPreview(
      send('POST', { sources: [{ label: 'Snare', technique: 'decca' }] })
    )
    expect(response.status).toBe(400)
  })

  it("404s for another organisation's room", async () => {
    const response = await postPreview(
      send('POST', { ...body, roomId: 'room_theirs' })
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/recommendations', () => {
  it('403s a viewer', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await postCreate(send('POST', body))
    expect(response.status).toBe(403)
    expect(provider.calls).toBe(0)
  })

  it("404s for another organisation's room", async () => {
    const response = await postCreate(
      send('POST', { ...body, roomId: 'room_theirs' })
    )
    expect(response.status).toBe(404)
    expect(provider.calls).toBe(0)
  })

  it('creates, then serves the same request again for free', async () => {
    const created = await postCreate(send('POST', body))
    expect(created.status).toBe(201)
    const first = await created.json()
    expect(first.cached).toBe(false)
    expect(first.recommendation.view.sources[0].primary.units[0].name).toBe(
      'Neumann U 87 Ai'
    )
    expect(provider.calls).toBe(1)

    const again = await postCreate(send('POST', body))
    expect(again.status).toBe(200)
    const second = await again.json()
    expect(second.cached).toBe(true)
    expect(second.recommendation.id).toBe(first.recommendation.id)
    expect(provider.calls).toBe(1)
    expect(store.results).toHaveLength(1)
  })

  it('regenerates when asked', async () => {
    await postCreate(send('POST', body))
    const response = await postCreate(
      send('POST', { ...body, regenerate: true })
    )
    expect(response.status).toBe(201)
    expect(provider.calls).toBe(2)
    expect(store.results).toHaveLength(2)
  })

  it("never reuses another organisation's answer", async () => {
    await postCreate(send('POST', body))
    store.units.push(unit('org_2', 'uy', 'm_u87'))
    signInAs(MemberRole.OWNER, { organisationId: 'org_2' })
    const response = await postCreate(
      send('POST', { sources: [{ label: 'Snare' }] })
    )
    expect(response.status).toBe(201)
    expect((await response.json()).cached).toBe(false)
    expect(provider.calls).toBe(2)
    // Each organisation's recommendation is its own row.
    expect(new Set(store.results.map((r) => r.organisationId))).toEqual(
      new Set(['org_1', 'org_2'])
    )
  })

  it('never touches the global AI cache', async () => {
    await postCreate(send('POST', body))
    expect(globalCache.findUnique).not.toHaveBeenCalled()
    expect(globalCache.upsert).not.toHaveBeenCalled()
  })

  it('200s with no recommendation, and spends nothing, when nothing can be ranked', async () => {
    store.units = []
    const response = await postCreate(send('POST', body))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.recommendation).toBeNull()
    expect(json.preview.rules.sources[0].unfillable).toBe('no_suitable_mic')
    expect(provider.calls).toBe(0)
  })

  it('503s and stores nothing when the model keeps breaking the rules', async () => {
    replies = (message) => {
      const reply = validReply(message)
      reply.sources[0].primary.option = 'c99'
      return reply
    }
    const response = await postCreate(send('POST', body))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('AI_UNAVAILABLE')
    expect(provider.calls).toBe(2)
    expect(store.results).toEqual([])
    // The rules-based preview is still available.
    expect((await postPreview(send('POST', body))).status).toBe(200)
  })

  it('503s without touching anything when AI is switched off', async () => {
    setAiProvider(null)
    vi.stubEnv('AI_ENABLED', 'false')
    const response = await postCreate(send('POST', body))
    vi.unstubAllEnvs()
    expect(response.status).toBe(503)
    expect(store.results).toEqual([])
  })

  it('403s with PLAN_LIMIT once the allowance is spent', async () => {
    vi.mocked(tenantDb).mockImplementation(((ctx: {
      organisationId: string
    }) => {
      const db = dbFor(ctx.organisationId)
      db.aiUsage.upsert.mockResolvedValue({ requests: 100000 })
      return db
    }) as never)
    const response = await postCreate(send('POST', body))
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('PLAN_LIMIT')
    expect(provider.calls).toBe(0)
  })

  it('429s with Retry-After when asking too fast', async () => {
    let last: Response | undefined
    for (let i = 0; i < 11; i++) {
      last = await postCreate(send('POST', { ...body, regenerate: true }))
    }
    expect(last!.status).toBe(429)
    expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(provider.calls).toBe(10)
  })
})

describe('GET /api/recommendations and /[id]', () => {
  it('lets a viewer read the list and a stored recommendation', async () => {
    const created = await (await postCreate(send('POST', body))).json()
    signInAs(MemberRole.VIEWER)

    const list = await (await listRoute(plain())).json()
    expect(list.recommendations).toHaveLength(1)
    expect(list.recommendations[0].title).toBe('Lead vocal, Snare')

    const one = await getOne(
      plain(),
      params({ recommendationId: created.recommendation.id })
    )
    expect(one.status).toBe(200)
    const { recommendation } = await one.json()
    expect(recommendation.unitState).toEqual({
      ua: 'available',
      ub: 'available'
    })
  })

  it("404s for another organisation's recommendation, and the list never includes it", async () => {
    const created = await (await postCreate(send('POST', body))).json()
    signInAs(MemberRole.OWNER, { organisationId: 'org_2' })

    const response = await getOne(
      plain(),
      params({ recommendationId: created.recommendation.id })
    )
    expect(response.status).toBe(404)
    expect((await (await listRoute(plain())).json()).recommendations).toEqual(
      []
    )
  })

  it('404s for an id that does not exist', async () => {
    expect(
      (await getOne(plain(), params({ recommendationId: 'nope' }))).status
    ).toBe(404)
  })
})

describe('PUT /api/recommendations/[id]/feedback', () => {
  const create = async () =>
    (await (await postCreate(send('POST', body))).json()).recommendation
      .id as string

  it('stores feedback, and replaces it when sent again', async () => {
    const id = await create()
    const put = (payload: unknown) =>
      putFeedback(send('PUT', payload), params({ recommendationId: id }))

    const first = await put({ sourceKey: 's1', verdict: 'accepted', rating: 4 })
    expect(first.status).toBe(200)
    expect((await first.json()).feedback).toMatchObject({ verdict: 'accepted' })

    await put({ sourceKey: 's1', verdict: 'rejected', reasons: ['unsafe'] })
    expect(store.feedback).toHaveLength(1)
    expect(store.feedback[0]).toMatchObject({
      organisationId: 'org_1',
      verdict: 'rejected',
      userId: 'user_1'
    })
  })

  it('records a swap to one of the studio’s own units', async () => {
    const id = await create()
    const response = await putFeedback(
      send('PUT', {
        sourceKey: 's1',
        verdict: 'swapped',
        swappedToUnitIds: ['ub']
      }),
      params({ recommendationId: id })
    )
    expect(response.status).toBe(200)
    expect(store.feedback[0]).toMatchObject({
      swappedToUnitIds: ['ub'],
      swappedToCandidate: true
    })
  })

  it('403s a viewer', async () => {
    const id = await create()
    signInAs(MemberRole.VIEWER)
    const response = await putFeedback(
      send('PUT', { sourceKey: 's1', verdict: 'accepted' }),
      params({ recommendationId: id })
    )
    expect(response.status).toBe(403)
    expect(store.feedback).toEqual([])
  })

  it('400s with field paths on bad input', async () => {
    const id = await create()
    const response = await putFeedback(
      send('PUT', { sourceKey: 's1', verdict: 'swapped' }),
      params({ recommendationId: id })
    )
    expect(response.status).toBe(400)
    expect((await response.json()).details[0].path).toBe('swappedToUnitIds')
  })

  it("404s on another organisation's recommendation", async () => {
    const id = await create()
    signInAs(MemberRole.OWNER, { organisationId: 'org_2' })
    const response = await putFeedback(
      send('PUT', { sourceKey: 's1', verdict: 'accepted' }),
      params({ recommendationId: id })
    )
    expect(response.status).toBe(404)
    expect(store.feedback).toEqual([])
  })

  it("404s on a swap to another organisation's unit", async () => {
    const id = await create()
    const response = await putFeedback(
      send('PUT', {
        sourceKey: 's1',
        verdict: 'swapped',
        swappedToUnitIds: ['ux']
      }),
      params({ recommendationId: id })
    )
    expect(response.status).toBe(404)
    expect(store.feedback).toEqual([])
  })
})
