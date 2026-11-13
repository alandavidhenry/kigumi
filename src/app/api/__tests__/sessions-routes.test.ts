import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as postMatch } from '@/app/api/layouts/[layoutId]/match-room/route'
import { GET as getLayoutPdf } from '@/app/api/layouts/[layoutId]/pdf/route'
import {
  GET as getLayoutRoute,
  PUT as putLayout
} from '@/app/api/layouts/[layoutId]/route'
import {
  DELETE as deleteTemplateRoute,
  PATCH as patchTemplate
} from '@/app/api/layouts/templates/[layoutId]/route'
import {
  GET as listTemplatesRoute,
  POST as postTemplate
} from '@/app/api/layouts/templates/route'
import { POST as postApply } from '@/app/api/sessions/[sessionId]/apply-recommendation/route'
import {
  DELETE as deleteChannelRoute,
  PATCH as patchChannel
} from '@/app/api/sessions/[sessionId]/channels/[channelId]/route'
import { PUT as putOrder } from '@/app/api/sessions/[sessionId]/channels/order/route'
import { POST as postChannel } from '@/app/api/sessions/[sessionId]/channels/route'
import { GET as getDaw } from '@/app/api/sessions/[sessionId]/daw-export/route'
import { POST as postDuplicate } from '@/app/api/sessions/[sessionId]/duplicate/route'
import {
  DELETE as deleteSessionRoute,
  GET as getSessionRoute,
  PATCH as patchSession
} from '@/app/api/sessions/[sessionId]/route'
import {
  DELETE as deleteShare,
  POST as postShare
} from '@/app/api/sessions/[sessionId]/share/route'
import { GET as getSheet } from '@/app/api/sessions/[sessionId]/sheet/route'
import {
  GET as listSessionsRoute,
  POST as postSession
} from '@/app/api/sessions/route'
import { POST as postWizard } from '@/app/api/sessions/wizard/route'
import { GET as getSharedPdf } from '@/app/api/share/[token]/sheet/route'
import { unauthorized } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers and real lib code, with the session and the
// database replaced. Every id here is "someone else's" unless a test sets up a
// row, because the fake database finds nothing for a foreign organisation.
vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: {
    sessionShareLink: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findFirst: vi.fn() }
  }
}))

const raw = vi.mocked(prisma, true)
let db: FakeDb

function signInAs(role: MemberRole, planTier = PlanTier.STUDIO) {
  vi.mocked(getTenantContext).mockResolvedValue(makeContext({ role, planTier }))
}

function jsonRequest(method: string, body: unknown = {}) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const sid = params({ sessionId: 'theirs' })
const lid = params({ layoutId: 'theirs' })

const newSession = {
  name: 'Drum day',
  startsAt: '2026-07-01T10:00',
  endsAt: '2026-07-01T18:00'
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
  // Nothing found: the shape of another organisation's id.
  for (const model of [
    db.recordingSession,
    db.layout,
    db.inputChannel,
    db.room,
    db.recommendationResult
  ]) {
    model.findFirst.mockResolvedValue(null)
    model.findMany.mockResolvedValue([])
    model.updateMany.mockResolvedValue({ count: 0 })
    model.deleteMany.mockResolvedValue({ count: 0 })
  }
  db.microphoneUnit.findMany.mockResolvedValue([])
  db.microphoneUnit.count.mockResolvedValue(0)
  db.sessionShareLink.updateMany.mockResolvedValue({ count: 0 })
})

const wizardBody = {
  details: { name: 'Wizard day', startsAt: '2026-07-01T10:00' },
  sources: [{ id: 'a', label: 'Lead vocal', kind: 'vocal_lead' }],
  picks: { mode: 'none' },
  layout: { kind: 'blank' }
}

// Each call is a route handler invoked as a member of an organisation that
// does not own the ids involved.
const foreignCalls: Array<[string, () => Promise<Response>]> = [
  ['GET session', () => getSessionRoute(new Request('http://x'), sid)],
  [
    'PATCH session',
    () => patchSession(jsonRequest('PATCH', { name: 'N' }), sid)
  ],
  ['DELETE session', () => deleteSessionRoute(new Request('http://x'), sid)],
  ['POST duplicate', () => postDuplicate(new Request('http://x'), sid)],
  [
    'POST channel',
    () => postChannel(jsonRequest('POST', { source: 'Synth' }), sid)
  ],
  [
    'PATCH channel',
    () =>
      patchChannel(
        jsonRequest('PATCH', { stand: 'a' }),
        params({ sessionId: 'theirs', channelId: 'c' })
      )
  ],
  [
    'DELETE channel',
    () =>
      deleteChannelRoute(
        new Request('http://x'),
        params({ sessionId: 'theirs', channelId: 'c' })
      )
  ],
  [
    'PUT channel order',
    () => putOrder(jsonRequest('PUT', { ids: ['a'] }), sid)
  ],
  [
    'POST apply recommendation',
    () => postApply(jsonRequest('POST', { resultId: 'r' }), sid)
  ],
  ['POST share', () => postShare(jsonRequest('POST'), sid)],
  ['DELETE share', () => deleteShare(new Request('http://x'), sid)],
  ['GET sheet PDF', () => getSheet(new Request('http://x'), sid)],
  ['GET DAW export', () => getDaw(new Request('http://x/?format=csv'), sid)],
  ['GET layout', () => getLayoutRoute(new Request('http://x'), lid)],
  [
    'PUT layout',
    () => putLayout(jsonRequest('PUT', { version: 1, items: [] }), lid)
  ],
  ['POST match room', () => postMatch(new Request('http://x'), lid)],
  ['GET layout PDF', () => getLayoutPdf(new Request('http://x'), lid)],
  [
    'PATCH template',
    () => patchTemplate(jsonRequest('PATCH', { name: 'N' }), lid)
  ],
  ['DELETE template', () => deleteTemplateRoute(new Request('http://x'), lid)],
  [
    'POST wizard with a foreign room',
    () =>
      postWizard(
        jsonRequest('POST', {
          ...wizardBody,
          details: { ...wizardBody.details, roomId: 'theirs' }
        })
      )
  ],
  [
    'POST wizard with a foreign recommendation result',
    () =>
      postWizard(
        jsonRequest('POST', {
          ...wizardBody,
          picks: { mode: 'ai', resultId: 'theirs' }
        })
      )
  ],
  [
    'POST template from a session',
    () => postTemplate(jsonRequest('POST', { name: 'T', fromSessionId: 'x' }))
  ]
]

describe('cross-organisation access', () => {
  it.each(foreignCalls)('%s returns 404', async (_name, call) => {
    const response = await call()
    expect(response.status).toBe(404)
  })

  it('404s when creating a session in, or from, something that is not yours', async () => {
    const inForeignRoom = await postSession(
      jsonRequest('POST', { ...newSession, roomId: 'theirs' })
    )
    expect(inForeignRoom.status).toBe(404)
    const fromForeignSession = await postSession(
      jsonRequest('POST', {
        ...newSession,
        startFrom: { kind: 'session', sessionId: 'theirs' }
      })
    )
    expect(fromForeignSession.status).toBe(404)
  })

  it("404s when a layout names another organisation's microphone", async () => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'x',
      version: 1,
      sessionId: 's1',
      isTemplate: false,
      items: []
    })
    const response = await putLayout(
      jsonRequest('PUT', {
        version: 1,
        items: [
          {
            id: 'new_1',
            type: 'mic',
            xMm: 1,
            yMm: 1,
            widthMm: 100,
            depthMm: 100,
            micUnitId: 'theirs'
          }
        ]
      }),
      params({ layoutId: 'l1' })
    )
    expect(response.status).toBe(404)
    expect(db.layoutItem.createMany).not.toHaveBeenCalled()
  })

  it("404s when applying another organisation's recommendation", async () => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      widthMm: 1,
      lengthMm: 1,
      session: { name: 'x' },
      items: []
    })
    const response = await postApply(
      jsonRequest('POST', { resultId: 'theirs' }),
      params({ sessionId: 's1' })
    )
    expect(response.status).toBe(404)
  })
})

describe('authentication and permission', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    for (const [, call] of foreignCalls) {
      expect((await call()).status).toBe(401)
    }
    expect((await listSessionsRoute(new Request('http://x'))).status).toBe(401)
    expect((await postSession(jsonRequest('POST', newSession))).status).toBe(
      401
    )
    expect((await listTemplatesRoute()).status).toBe(401)
  })

  it('lets a viewer read but not change anything', async () => {
    signInAs(MemberRole.VIEWER)
    db.recordingSession.findMany.mockResolvedValue([])
    expect((await listSessionsRoute(new Request('http://x'))).status).toBe(200)

    const writes: Array<[string, () => Promise<Response>]> = [
      ['create', () => postSession(jsonRequest('POST', newSession))],
      ['update', () => patchSession(jsonRequest('PATCH', { name: 'N' }), sid)],
      ['delete', () => deleteSessionRoute(new Request('http://x'), sid)],
      ['duplicate', () => postDuplicate(new Request('http://x'), sid)],
      ['channel', () => postChannel(jsonRequest('POST', { source: 'x' }), sid)],
      ['apply', () => postApply(jsonRequest('POST', { resultId: 'r' }), sid)],
      ['share', () => postShare(jsonRequest('POST'), sid)],
      [
        'layout',
        () => putLayout(jsonRequest('PUT', { version: 1, items: [] }), lid)
      ],
      ['match room', () => postMatch(new Request('http://x'), lid)]
    ]
    for (const [name, call] of writes) {
      expect((await call()).status, name).toBe(403)
    }
  })

  it('400s on invalid input with field paths', async () => {
    const response = await postSession(
      jsonRequest('POST', { ...newSession, name: '', startsAt: 'soon' })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['name', 'startsAt'])
    )
    const bad = await putLayout(
      jsonRequest('PUT', { version: 1, items: [{ id: 'a' }] }),
      lid
    )
    expect(bad.status).toBe(400)
    const format = await getDaw(new Request('http://x/?format=xml'), sid)
    expect(format.status).toBe(400)
  })
})

describe('templates (Pro)', () => {
  it('gives Free organisations a plan error, Pro a list', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    const free = await listTemplatesRoute()
    expect(free.status).toBe(403)
    expect((await free.json()).code).toBe('FEATURE_NOT_IN_PLAN')

    signInAs(MemberRole.OWNER, PlanTier.PRO)
    db.layout.findMany.mockResolvedValue([])
    expect((await listTemplatesRoute()).status).toBe(200)
  })

  it('refuses starting a session from your own template on Free', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    const response = await postSession(
      jsonRequest('POST', {
        ...newSession,
        startFrom: { kind: 'template', layoutId: 't1' }
      })
    )
    expect(response.status).toBe(403)
  })
})

describe('session lifecycle', () => {
  it('creates a session through the wizard', async () => {
    db.layout.create.mockResolvedValue({ id: 'l1' })
    db.layoutItem.findMany.mockResolvedValue([])
    const response = await postWizard(jsonRequest('POST', wizardBody))
    expect(response.status).toBe(201)
    expect((await response.json()).result).toMatchObject({
      id: expect.any(String),
      recall: 'skipped',
      warnings: []
    })
  })

  it('returns 400 for an invalid wizard body and 403 for a viewer', async () => {
    expect(
      (await postWizard(jsonRequest('POST', { ...wizardBody, sources: [] })))
        .status
    ).toBe(400)
    signInAs(MemberRole.VIEWER)
    expect((await postWizard(jsonRequest('POST', wizardBody))).status).toBe(403)
  })

  it('creates a session from a built-in template on the Free plan', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    db.layout.create.mockResolvedValue({ id: 'l1' })
    db.layoutItem.findMany.mockResolvedValue([])
    const response = await postSession(
      jsonRequest('POST', {
        ...newSession,
        startFrom: { kind: 'builtin', templateId: 'band-tracking' }
      })
    )
    expect(response.status).toBe(201)
    expect((await response.json()).session.id).toEqual(expect.any(String))
  })

  it('returns 409 for a stale layout save', async () => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'x',
      version: 5,
      sessionId: 's1',
      isTemplate: false,
      items: []
    })
    const response = await putLayout(
      jsonRequest('PUT', { version: 4, items: [] }),
      params({ layoutId: 'l1' })
    )
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('CONFLICT')
  })

  it('exports DAW track names as CSV and text', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ name: 'Drum Day!' })
    db.inputChannel.findMany.mockResolvedValue([
      { number: 1, source: 'Kick', dawName: null },
      { number: 2, source: 'Snare', dawName: 'SN_TOP' }
    ])
    const csv = await getDaw(
      new Request('http://x/?format=csv'),
      params({ sessionId: 's1' })
    )
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(csv.headers.get('content-disposition')).toContain(
      'drum-day-tracks.csv'
    )
    expect(await csv.text()).toBe('Track,Name\r\n1,Kick\r\n2,SN_TOP\r\n')
    const txt = await getDaw(
      new Request('http://x/?format=txt'),
      params({ sessionId: 's1' })
    )
    expect(await txt.text()).toBe('1. Kick\n2. SN_TOP\n')
  })
})

const sessionRow = {
  id: 's1',
  organisationId: 'org_1',
  name: 'Drum day',
  client: 'Band',
  notes: 'Bring snacks',
  status: 'planned',
  startsAt: new Date('2026-07-01T09:00:00Z'),
  endsAt: new Date('2026-07-01T17:00:00Z'),
  roomId: 'r1',
  channelsAvailable: null,
  phantomMode: 'per_channel',
  room: { name: 'Live room', studio: { timezone: 'Europe/London' } }
}
const layoutRow = {
  id: 'l1',
  name: 'Drum day',
  widthMm: 6000,
  lengthMm: 5000,
  heightMm: null,
  gridMm: 500,
  snapMm: 50,
  version: 2,
  items: [
    {
      id: 'i1',
      type: 'mic',
      variant: null,
      label: 'Snare',
      xMm: 2000,
      yMm: 2000,
      zMm: 700,
      rotationDeg: 90,
      pitchDeg: 0,
      widthMm: 100,
      depthMm: 100,
      heightMm: 200,
      sortOrder: 0,
      locked: false,
      groupId: null,
      micUnitId: null,
      equipmentItemId: null,
      patternSetting: 'cardioid',
      showPattern: true,
      recommendationRef: null,
      notes: null
    }
  ]
}
const channelRow = {
  id: 'c1',
  number: 1,
  layoutItemId: 'i1',
  kind: 'mic',
  source: 'Snare',
  micUnitId: null,
  stand: 'Boom',
  preampInput: null,
  phantom: false,
  padDb: null,
  dawName: null,
  notes: 'Internal note'
}

describe('PDF export', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue(sessionRow)
    db.layout.findFirst.mockResolvedValue(layoutRow)
    db.inputChannel.findMany.mockResolvedValue([channelRow])
  })

  it('renders the session sheet as a PDF for the team', async () => {
    const response = await getSheet(
      new Request('http://x'),
      params({ sessionId: 's1' })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  }, 20_000)

  it('renders a layout as a PDF', async () => {
    db.layout.findFirst.mockResolvedValue({
      ...layoutRow,
      sessionId: 's1',
      isTemplate: false
    })
    const response = await getLayoutPdf(
      new Request('http://x'),
      params({ layoutId: 'l1' })
    )
    expect(response.headers.get('content-type')).toBe('application/pdf')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  }, 20_000)
})

describe('the public share link', () => {
  const token = 'b'.repeat(43)

  beforeEach(() => {
    // No session at all: this route must not need one.
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    raw.sessionShareLink.findUnique.mockResolvedValue({
      id: 'link1',
      organisationId: 'org_1',
      sessionId: 's1',
      expiresAt: null,
      revokedAt: null
    } as never)
    raw.sessionShareLink.update.mockResolvedValue({} as never)
    raw.organization.findFirst.mockResolvedValue({
      name: 'Northern Lights',
      planTier: 'free'
    } as never)
    db.recordingSession.findFirst.mockResolvedValue(sessionRow)
    db.layout.findFirst.mockResolvedValue(layoutRow)
    db.inputChannel.findMany.mockResolvedValue([channelRow])
  })

  it('serves a PDF to someone who is not signed in, with no-index headers', async () => {
    const response = await getSharedPdf(
      new Request('http://x'),
      params({ token })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getTenantContext).not.toHaveBeenCalled()
  }, 20_000)

  it('is a plain 404 for a revoked, expired, unknown or malformed token', async () => {
    raw.sessionShareLink.findUnique.mockResolvedValue({
      id: 'l',
      organisationId: 'org_1',
      sessionId: 's1',
      expiresAt: null,
      revokedAt: new Date()
    } as never)
    expect(
      (await getSharedPdf(new Request('http://x'), params({ token }))).status
    ).toBe(404)
    raw.sessionShareLink.findUnique.mockResolvedValue(null)
    expect(
      (await getSharedPdf(new Request('http://x'), params({ token }))).status
    ).toBe(404)
    expect(
      (
        await getSharedPdf(
          new Request('http://x'),
          params({ token: '../../etc/passwd' })
        )
      ).status
    ).toBe(404)
  })
})
