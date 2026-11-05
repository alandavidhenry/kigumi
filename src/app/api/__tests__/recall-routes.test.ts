import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DELETE as deleteTemplateRoute,
  GET as getTemplateRoute,
  PATCH as patchTemplate
} from '@/app/api/console-templates/[templateId]/route'
import {
  GET as listTemplatesRoute,
  POST as postTemplate
} from '@/app/api/console-templates/route'
import {
  DELETE as deleteConsoleRoute,
  PATCH as patchConsole
} from '@/app/api/consoles/[consoleId]/route'
import {
  GET as listConsolesRoute,
  POST as postConsole
} from '@/app/api/consoles/route'
import { PATCH as patchRecallChannel } from '@/app/api/sessions/[sessionId]/recall/channels/[channelId]/route'
import {
  DELETE as deleteOutboardRoute,
  PATCH as patchOutboard
} from '@/app/api/sessions/[sessionId]/recall/outboard/[outboardId]/route'
import { POST as postOutboard } from '@/app/api/sessions/[sessionId]/recall/outboard/route'
import { GET as getRecallPdf } from '@/app/api/sessions/[sessionId]/recall/pdf/route'
import { POST as postRecallPhoto } from '@/app/api/sessions/[sessionId]/recall/photos/route'
import {
  DELETE as deleteRecall,
  GET as getRecall,
  PATCH as patchRecall,
  POST as postRecall
} from '@/app/api/sessions/[sessionId]/recall/route'
import { POST as postRecallSync } from '@/app/api/sessions/[sessionId]/recall/sync/route'
import { unauthorized } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
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
vi.mock('@/lib/storage', () => ({
  blobPathFor: vi.fn(),
  uploadBlob: vi.fn(),
  downloadBlob: vi.fn(),
  deleteBlob: vi.fn()
}))

let db: FakeDb

function signInAs(role: MemberRole, planTier = PlanTier.FREE) {
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
const tid = params({ templateId: 'theirs' })
const cid = params({ consoleId: 'theirs' })
const get = () => new Request('http://x')

const strip = {
  sections: [
    { label: 'Input', controls: [{ key: 'gain', label: 'Gain', type: 'knob' }] }
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
  // Nothing found: the shape of another organisation's id.
  for (const model of [
    db.recordingSession,
    db.recallSheet,
    db.recallChannel,
    db.outboardRecall,
    db.console,
    db.consoleTemplate,
    db.equipmentItem
  ]) {
    model.findFirst.mockResolvedValue(null)
    model.findMany.mockResolvedValue([])
    model.updateMany.mockResolvedValue({ count: 0 })
    model.deleteMany.mockResolvedValue({ count: 0 })
    model.count.mockResolvedValue(0)
  }
})

const foreignCalls: Array<[string, () => Promise<Response>]> = [
  ['GET recall', () => getRecall(get(), sid)],
  [
    'POST recall',
    () => postRecall(jsonRequest('POST', { consoleId: 'c1' }), sid)
  ],
  [
    'PATCH recall',
    () => patchRecall(jsonRequest('PATCH', { notes: 'n' }), sid)
  ],
  ['DELETE recall', () => deleteRecall(get(), sid)],
  ['POST recall sync', () => postRecallSync(get(), sid)],
  [
    'PATCH recall channel',
    () =>
      patchRecallChannel(
        jsonRequest('PATCH', { label: 'x' }),
        params({ sessionId: 'theirs', channelId: 'c' })
      )
  ],
  [
    'POST outboard',
    () => postOutboard(jsonRequest('POST', { name: 'LA-2A' }), sid)
  ],
  [
    'PATCH outboard',
    () =>
      patchOutboard(
        jsonRequest('PATCH', { name: 'x' }),
        params({ sessionId: 'theirs', outboardId: 'o' })
      )
  ],
  [
    'DELETE outboard',
    () =>
      deleteOutboardRoute(
        get(),
        params({ sessionId: 'theirs', outboardId: 'o' })
      )
  ],
  ['GET recall PDF', () => getRecallPdf(get(), sid)],
  [
    'POST recall photo',
    () => {
      const form = new FormData()
      form.set('file', new File([new Uint8Array([1])], 'd.png'))
      return postRecallPhoto(
        new Request('http://x', { method: 'POST', body: form }),
        sid
      )
    }
  ],
  ['GET template', () => getTemplateRoute(get(), tid)],
  [
    'PATCH template',
    () => patchTemplate(jsonRequest('PATCH', { name: 'N' }), tid)
  ],
  ['DELETE template', () => deleteTemplateRoute(get(), tid)],
  [
    'PATCH console',
    () => patchConsole(jsonRequest('PATCH', { name: 'N' }), cid)
  ],
  ['DELETE console', () => deleteConsoleRoute(get(), cid)]
]

describe('cross-organisation access', () => {
  it.each(foreignCalls)('%s returns 404', async (_name, call) => {
    const response = await call()
    expect(response.status).toBe(404)
  })

  it('404s creating a console on a template that is not yours', async () => {
    const response = await postConsole(
      jsonRequest('POST', {
        name: 'Desk',
        channelCount: 8,
        templateId: 'theirs'
      })
    )
    expect(response.status).toBe(404)
    expect(db.console.create).not.toHaveBeenCalled()
  })

  it('404s creating a recall sheet from a console or a session that is not yours', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    const fromConsole = await postRecall(
      jsonRequest('POST', { consoleId: 'theirs' }),
      params({ sessionId: 's1' })
    )
    expect(fromConsole.status).toBe(404)
    const fromSession = await postRecall(
      jsonRequest('POST', { fromSessionId: 'theirs' }),
      params({ sessionId: 's1' })
    )
    expect(fromSession.status).toBe(404)
    expect(db.recallSheet.create).not.toHaveBeenCalled()
  })

  it("404s linking outboard to another organisation's equipment", async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1', strip })
    const response = await postOutboard(
      jsonRequest('POST', { name: 'LA-2A', equipmentItemId: 'theirs' }),
      params({ sessionId: 's1' })
    )
    expect(response.status).toBe(404)
    expect(db.outboardRecall.create).not.toHaveBeenCalled()
  })
})

describe('authentication and permission', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    for (const [, call] of foreignCalls) {
      expect((await call()).status).toBe(401)
    }
    expect((await listConsolesRoute()).status).toBe(401)
    expect((await listTemplatesRoute()).status).toBe(401)
    expect(
      (
        await postConsole(
          jsonRequest('POST', { name: 'D', channelCount: 8, templateId: 't' })
        )
      ).status
    ).toBe(401)
    expect(
      (await postTemplate(jsonRequest('POST', { name: 'T', strip }))).status
    ).toBe(401)
  })

  it('lets a viewer read but not change anything', async () => {
    signInAs(MemberRole.VIEWER)
    expect((await listConsolesRoute()).status).toBe(200)
    expect((await listTemplatesRoute()).status).toBe(200)

    const writes: Array<[string, () => Promise<Response>]> = [
      [
        'create template',
        () => postTemplate(jsonRequest('POST', { name: 'T', strip }))
      ],
      [
        'create console',
        () =>
          postConsole(
            jsonRequest('POST', { name: 'D', channelCount: 8, templateId: 't' })
          )
      ],
      ['edit console', () => patchConsole(jsonRequest('PATCH', {}), cid)],
      ['delete console', () => deleteConsoleRoute(get(), cid)],
      ['edit template', () => patchTemplate(jsonRequest('PATCH', {}), tid)],
      ['delete template', () => deleteTemplateRoute(get(), tid)],
      ['create recall', () => postRecall(jsonRequest('POST', {}), sid)],
      ['edit recall', () => patchRecall(jsonRequest('PATCH', {}), sid)],
      ['delete recall', () => deleteRecall(get(), sid)],
      ['sync recall', () => postRecallSync(get(), sid)],
      [
        'edit channel',
        () =>
          patchRecallChannel(
            jsonRequest('PATCH', {}),
            params({ sessionId: 'theirs', channelId: 'c' })
          )
      ],
      [
        'add outboard',
        () => postOutboard(jsonRequest('POST', { name: 'x' }), sid)
      ]
    ]
    for (const [name, call] of writes) {
      expect((await call()).status, name).toBe(403)
    }
  })

  it('is free on every plan: a Free-plan engineer can build and edit recall', async () => {
    signInAs(MemberRole.ENGINEER, PlanTier.FREE)
    db.consoleTemplate.create.mockResolvedValue({ id: 't1' })
    const response = await postTemplate(
      jsonRequest('POST', { name: 'Mine', strip })
    )
    expect(response.status).toBe(201)
  })
})

describe('validation', () => {
  it('400s an invalid strip with the field path', async () => {
    const response = await postTemplate(
      jsonRequest('POST', { name: 'T', strip: { sections: [] } })
    )
    expect(response.status).toBe(400)
  })

  it('400s recall values that do not fit the strip', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1', strip })
    db.recallChannel.findFirst.mockResolvedValue({ stripNumber: 1 })
    const response = await patchRecallChannel(
      jsonRequest('PATCH', { values: { unknown: 1 } }),
      params({ sessionId: 's1', channelId: 'c1' })
    )
    expect(response.status).toBe(400)
    expect(db.recallChannel.updateMany).not.toHaveBeenCalled()
  })

  it('409s a second recall sheet for a session', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.count.mockResolvedValue(1)
    const response = await postRecall(
      jsonRequest('POST', { consoleId: 'c1' }),
      params({ sessionId: 's1' })
    )
    expect(response.status).toBe(409)
  })

  it('400s a photo upload with no file', async () => {
    const response = await postRecallPhoto(
      new Request('http://x', { method: 'POST', body: new FormData() }),
      params({ sessionId: 's1' })
    )
    expect(response.status).toBe(400)
  })
})

describe('recall PDF', () => {
  it('renders a PDF for a sheet in this organisation', async () => {
    db.recordingSession.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Drums',
      client: null,
      startsAt: new Date('2026-07-01T09:00:00Z'),
      endsAt: new Date('2026-07-01T17:00:00Z'),
      room: null
    })
    db.recallSheet.findFirst.mockResolvedValue({
      id: 'rs1',
      consoleId: null,
      consoleName: 'Desk',
      channelCount: 8,
      strip,
      notes: null,
      channels: [
        {
          id: 'rc1',
          stripNumber: 1,
          label: 'Kick',
          micName: null,
          values: { gain: 30 },
          notes: null
        }
      ],
      outboard: []
    })
    db.attachment.findMany.mockResolvedValue([])
    const response = await getRecallPdf(get(), params({ sessionId: 's1' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
})
