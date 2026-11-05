import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GET as cronReminders,
  POST as cronRemindersPost
} from '@/app/api/cron/reminders/route'
import { PUT as putUsage } from '@/app/api/equipment/[equipmentId]/usage/route'
import { POST as postLogFile } from '@/app/api/maintenance/log/[logId]/files/route'
import { DELETE as deleteLog } from '@/app/api/maintenance/log/[logId]/route'
import {
  GET as listLogRoute,
  POST as postLog
} from '@/app/api/maintenance/log/route'
import {
  DELETE as deletePlanRoute,
  PATCH as patchPlan
} from '@/app/api/maintenance/plans/[planId]/route'
import {
  GET as listPlansRoute,
  POST as postPlan
} from '@/app/api/maintenance/plans/route'
import { POST as completeTaskRoute } from '@/app/api/maintenance/tasks/[taskId]/complete/route'
import { GET as listTasksRoute } from '@/app/api/maintenance/tasks/route'
import { POST as readNotifications } from '@/app/api/notifications/read/route'
import { GET as listNotificationsRoute } from '@/app/api/notifications/route'
import {
  DELETE as deletePatRoute,
  PATCH as patchPat
} from '@/app/api/pat/[testId]/route'
import { GET as listPatRoute, POST as postPat } from '@/app/api/pat/route'
import { POST as postWarrantyFile } from '@/app/api/warranties/[warrantyId]/files/route'
import {
  DELETE as deleteWarrantyRoute,
  PATCH as patchWarranty
} from '@/app/api/warranties/[warrantyId]/route'
import {
  GET as listWarrantiesRoute,
  POST as postWarranty
} from '@/app/api/warranties/route'
import { unauthorized } from '@/lib/errors'
import { runReminders } from '@/lib/maintenance/reminders'
import { PlanTier } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers and real lib code, with the session and the
// database replaced. Every id is "someone else's" unless a test sets up a row,
// because the fake database finds nothing for a foreign organisation.
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
vi.mock('@/lib/maintenance/reminders', () => ({ runReminders: vi.fn() }))

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

function fileRequest() {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1])], 'r.pdf'))
  return new Request('http://x', { method: 'POST', body: form })
}

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const get = (url = 'http://x') => new Request(url)
const plan = params({ planId: 'theirs' })
const task = params({ taskId: 'theirs' })
const log = params({ logId: 'theirs' })
const test = params({ testId: 'theirs' })
const warranty = params({ warrantyId: 'theirs' })

const models = () => [
  db.equipmentItem,
  db.maintenancePlan,
  db.maintenanceTask,
  db.maintenanceLog,
  db.patTest,
  db.warranty,
  db.attachment,
  db.usageCounter
]

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
  // Nothing found: the shape of another organisation's id.
  for (const model of models()) {
    model.findFirst.mockResolvedValue(null)
    model.findMany.mockResolvedValue([])
    model.updateMany.mockResolvedValue({ count: 0 })
    model.deleteMany.mockResolvedValue({ count: 0 })
    model.count.mockResolvedValue(0)
  }
  db.notification.findMany.mockResolvedValue([])
  db.notification.count.mockResolvedValue(0)
  db.notification.updateMany.mockResolvedValue({ count: 0 })
})

const foreignCalls: Array<[string, () => Promise<Response>]> = [
  ['PATCH plan', () => patchPlan(jsonRequest('PATCH', { title: 'x' }), plan)],
  ['DELETE plan', () => deletePlanRoute(get(), plan)],
  [
    'POST plan on a foreign item',
    () =>
      postPlan(
        jsonRequest('POST', {
          title: 'x',
          equipmentItemId: 'theirs',
          intervalDays: 30
        })
      )
  ],
  [
    'POST complete task',
    () => completeTaskRoute(jsonRequest('POST', {}), task)
  ],
  [
    'POST log on a foreign item',
    () =>
      postLog(jsonRequest('POST', { equipmentItemId: 'theirs', title: 'x' }))
  ],
  ['DELETE log', () => deleteLog(get(), log)],
  ['POST log file', () => postLogFile(fileRequest(), log)],
  [
    'POST PAT on a foreign item',
    () =>
      postPat(
        jsonRequest('POST', {
          equipmentItemId: 'theirs',
          testedAt: '2026-01-01',
          result: 'pass'
        })
      )
  ],
  ['PATCH PAT', () => patchPat(jsonRequest('PATCH', { result: 'pass' }), test)],
  ['DELETE PAT', () => deletePatRoute(get(), test)],
  [
    'POST warranty on a foreign item',
    () =>
      postWarranty(
        jsonRequest('POST', { equipmentItemId: 'theirs', endsOn: '2027-01-01' })
      )
  ],
  [
    'PATCH warranty',
    () => patchWarranty(jsonRequest('PATCH', { provider: 'x' }), warranty)
  ],
  ['DELETE warranty', () => deleteWarrantyRoute(get(), warranty)],
  ['POST warranty file', () => postWarrantyFile(fileRequest(), warranty)],
  [
    'PUT usage',
    () =>
      putUsage(
        jsonRequest('PUT', { hours: 10 }),
        params({ equipmentId: 'theirs' })
      )
  ]
]

describe('cross-organisation access', () => {
  it.each(foreignCalls)('%s returns 404', async (_name, call) => {
    expect((await call()).status).toBe(404)
  })

  it('writes nothing for any of them', async () => {
    for (const [, call] of foreignCalls) await call()
    for (const model of models()) {
      expect(model.create).not.toHaveBeenCalled()
      expect(model.createMany).not.toHaveBeenCalled()
      expect(model.upsert).not.toHaveBeenCalled()
    }
  })

  it('lists come back empty rather than leaking other organisations', async () => {
    for (const [route, key] of [
      [listPlansRoute(get()), 'plans'],
      [listTasksRoute(get()), 'tasks'],
      [listLogRoute(get()), 'log'],
      [listPatRoute(get()), 'tests'],
      [listWarrantiesRoute(get()), 'warranties']
    ] as const) {
      const response = await route
      expect(response.status).toBe(200)
      expect((await response.json())[key]).toEqual([])
    }
  })
})

describe('authentication', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    for (const [, call] of foreignCalls) expect((await call()).status).toBe(401)
    for (const response of await Promise.all([
      listPlansRoute(get()),
      listTasksRoute(get()),
      listLogRoute(get()),
      listPatRoute(get()),
      listWarrantiesRoute(get()),
      listNotificationsRoute(),
      readNotifications(jsonRequest('POST', { all: true }))
    ])) {
      expect(response.status).toBe(401)
    }
  })
})

describe('permissions', () => {
  it('lets a viewer read but not change anything', async () => {
    signInAs(MemberRole.VIEWER)
    for (const read of [
      listPlansRoute(get()),
      listTasksRoute(get()),
      listLogRoute(get()),
      listPatRoute(get()),
      listWarrantiesRoute(get())
    ]) {
      expect((await read).status).toBe(200)
    }
    for (const [name, call] of foreignCalls) {
      expect((await call()).status, name).toBe(403)
    }
  })
})

describe('plan gates', () => {
  it('the PAT register is a Studio feature: 403 on Free and Pro', async () => {
    for (const tier of [PlanTier.FREE, PlanTier.PRO]) {
      signInAs(MemberRole.OWNER, tier)
      const response = await listPatRoute(get())
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('FEATURE_NOT_IN_PLAN')
      expect(
        (
          await postPat(
            jsonRequest('POST', {
              equipmentItemId: 'e1',
              testedAt: '2026-01-01',
              result: 'pass'
            })
          )
        ).status
      ).toBe(403)
    }
    signInAs(MemberRole.OWNER, PlanTier.STUDIO)
    expect((await listPatRoute(get())).status).toBe(200)
  })

  it('usage-hour plans and meters are a Studio feature', async () => {
    signInAs(MemberRole.OWNER, PlanTier.PRO)
    const hours = await postPlan(
      jsonRequest('POST', {
        title: 'Valves',
        equipmentItemId: 'e1',
        intervalHours: 500
      })
    )
    expect(hours.status).toBe(403)
    expect(
      (
        await putUsage(
          jsonRequest('PUT', { hours: 5 }),
          params({ equipmentId: 'e1' })
        )
      ).status
    ).toBe(403)
  })

  it('time-based plans and warranties work on Free', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    expect((await listPlansRoute(get())).status).toBe(200)
    expect((await listWarrantiesRoute(get())).status).toBe(200)
    expect((await listTasksRoute(get())).status).toBe(200)
  })
})

describe('validation', () => {
  it('400s a malformed body', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1' })
    const response = await postPlan(
      jsonRequest('POST', { title: '', equipmentItemId: 'e1' })
    )
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('BAD_REQUEST')
  })

  it('400s an upload with no file', async () => {
    db.warranty.findFirst.mockResolvedValue({ id: 'w1' })
    const response = await postWarrantyFile(
      new Request('http://x', { method: 'POST', body: new FormData() }),
      warranty
    )
    expect(response.status).toBe(400)
  })
})

describe('notifications', () => {
  it('returns the caller’s own with the unread count', async () => {
    signInAs(MemberRole.VIEWER)
    db.notification.count.mockResolvedValue(4)
    const response = await listNotificationsRoute()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ notifications: [], unread: 4 })
    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user_1'
    })
  })

  it('marks as read only within the caller’s own notifications', async () => {
    signInAs(MemberRole.VIEWER)
    db.notification.updateMany.mockResolvedValue({ count: 1 })
    const response = await readNotifications(
      jsonRequest('POST', { ids: ['someone-elses'] })
    )
    expect(response.status).toBe(200)
    expect(db.notification.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: 'user_1'
    })
    expect(
      (await readNotifications(jsonRequest('POST', { ids: [] }))).status
    ).toBe(400)
  })
})

describe('cron reminders', () => {
  const call = (handler: typeof cronReminders, authorization?: string) =>
    handler(
      new Request('http://x/api/cron/reminders', {
        method: 'POST',
        headers: authorization ? { authorization } : {}
      })
    )

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.mocked(runReminders).mockResolvedValue({
      organisations: 2,
      created: 5,
      emails: 1,
      emailFailures: 0
    })
  })

  it('401s without the secret and never runs the job', async () => {
    expect((await call(cronRemindersPost)).status).toBe(401)
    expect((await call(cronRemindersPost, 'Bearer nope')).status).toBe(401)
    expect((await call(cronReminders, 'Bearer nope')).status).toBe(401)
    expect(runReminders).not.toHaveBeenCalled()
  })

  it('is refused outright when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call(cronRemindersPost, 'Bearer ')).status).toBe(401)
    expect(runReminders).not.toHaveBeenCalled()
  })

  it('runs the job and reports what it did', async () => {
    const response = await call(cronRemindersPost, 'Bearer s3cret')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      organisations: 2,
      created: 5,
      emails: 1,
      emailFailures: 0
    })
    expect(runReminders).toHaveBeenCalledTimes(1)
  })

  it('does not need a user session', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await call(cronRemindersPost, 'Bearer s3cret')).status).toBe(200)
  })
})
