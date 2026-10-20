import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GET as adminGetMic,
  PATCH as adminPatchMic
} from '@/app/api/admin/mics/[micId]/route'
import { POST as adminStatus } from '@/app/api/admin/mics/[micId]/status/route'
import {
  GET as adminList,
  POST as adminCreate
} from '@/app/api/admin/mics/route'
import {
  DELETE as deleteUnit,
  PATCH as patchUnit
} from '@/app/api/locker/[unitId]/route'
import { GET as lockerList, POST as lockerAdd } from '@/app/api/locker/route'
import { GET as getMicRoute } from '@/app/api/mics/[micId]/route'
import { GET as listMicsRoute } from '@/app/api/mics/route'
import { unauthorized } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { getSession, getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers + real src/lib, with the session, tenant
// database and catalogue database replaced.
// First call's `where`, typed loosely so assertions can probe any key.
const whereOf = (fn: { mock: { calls: unknown[][] } }) =>
  (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where

vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn(),
  getSession: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn
}))
vi.mock('@/lib/prisma', () => ({
  default: {
    microphoneModel: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      groupBy: vi.fn()
    }
  }
}))

const catalogue = vi.mocked(prisma.microphoneModel, true)
let db: FakeDb

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const plain = () => new Request('http://localhost/api')
const json = (method: string, body: unknown) =>
  new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

function signInAs(role: MemberRole) {
  vi.mocked(getTenantContext).mockResolvedValue(makeContext({ role }))
}

function sessionFor(email: string | null) {
  vi.mocked(getSession).mockResolvedValue(
    email
      ? ({
          user: { id: 'u1', name: 'Pat', email, emailVerified: true },
          session: {}
        } as never)
      : null
  )
}

const publishedMic = {
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'admin@kigumi.test')
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
  sessionFor('admin@kigumi.test')
})

describe('/api/mics', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await listMicsRoute(plain())).status).toBe(401)
    expect((await getMicRoute(plain(), params({ micId: 'x' }))).status).toBe(
      401
    )
  })

  it('lists published microphones for viewers', async () => {
    signInAs(MemberRole.VIEWER)
    catalogue.findMany.mockResolvedValue([publishedMic] as never)
    const response = await listMicsRoute(
      new Request('http://localhost/api/mics?pattern=cardioid')
    )
    expect(response.status).toBe(200)
    expect((await response.json()).mics).toHaveLength(1)
    expect(whereOf(catalogue.findMany).status).toBe('published')
  })

  it('400s on an invalid filter', async () => {
    const response = await listMicsRoute(
      new Request('http://localhost/api/mics?pattern=wide')
    )
    expect(response.status).toBe(400)
  })

  it('404s for a draft or unknown microphone', async () => {
    catalogue.findFirst.mockResolvedValue(null)
    const response = await getMicRoute(plain(), params({ micId: 'draft' }))
    expect(response.status).toBe(404)
  })
})

describe('/api/locker', () => {
  it('lists the organisation locker for viewers', async () => {
    signInAs(MemberRole.VIEWER)
    db.microphoneUnit.findMany.mockResolvedValue([])
    expect((await lockerList()).status).toBe(200)
  })

  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await lockerList()).status).toBe(401)
    expect((await lockerAdd(json('POST', { micModelId: 'm1' }))).status).toBe(
      401
    )
  })

  it('403s a viewer adding a microphone', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await lockerAdd(json('POST', { micModelId: 'm1' }))
    expect(response.status).toBe(403)
  })

  it('400s on invalid input with field paths', async () => {
    const response = await lockerAdd(json('POST', { condition: 'bad' }))
    expect(response.status).toBe(400)
    expect((await response.json()).details.length).toBeGreaterThan(0)
  })

  it('creates a unit from a published model', async () => {
    catalogue.findFirst.mockResolvedValue(publishedMic as never)
    db.equipmentItem.count.mockResolvedValue(0)
    db.equipmentItem.create.mockResolvedValue({ id: 'eq_new' })
    db.microphoneUnit.create.mockResolvedValue({
      id: 'unit_1',
      micModelId: 'm1',
      equipmentItemId: 'eq_new',
      serial: null,
      condition: 'good',
      matchedPairGroup: null,
      notes: null,
      equipmentItem: { status: 'in_service', room: null }
    })
    const response = await lockerAdd(json('POST', { micModelId: 'm1' }))
    expect(response.status).toBe(201)
  })

  it("404s linking another organisation's equipment item", async () => {
    catalogue.findFirst.mockResolvedValue(publishedMic as never)
    db.equipmentItem.findFirst.mockResolvedValue(null)
    const response = await lockerAdd(
      json('POST', { micModelId: 'm1', equipmentItemId: 'other_org_item' })
    )
    expect(response.status).toBe(404)
    expect(db.microphoneUnit.create).not.toHaveBeenCalled()
  })

  it("404s patching and deleting another organisation's unit", async () => {
    db.microphoneUnit.findFirst.mockResolvedValue(null)
    const patched = await patchUnit(
      json('PATCH', { condition: 'fair' }),
      params({ unitId: 'other' })
    )
    expect(patched.status).toBe(404)
    const deleted = await deleteUnit(plain(), params({ unitId: 'other' }))
    expect(deleted.status).toBe(404)
    expect(db.microphoneUnit.updateMany).not.toHaveBeenCalled()
    expect(db.microphoneUnit.deleteMany).not.toHaveBeenCalled()
  })

  it('403s a viewer patching or deleting', async () => {
    signInAs(MemberRole.VIEWER)
    expect(
      (
        await patchUnit(
          json('PATCH', { condition: 'fair' }),
          params({ unitId: 'u' })
        )
      ).status
    ).toBe(403)
    expect((await deleteUnit(plain(), params({ unitId: 'u' }))).status).toBe(
      403
    )
  })

  it('204s on delete', async () => {
    db.microphoneUnit.findFirst.mockResolvedValue({
      id: 'unit_1',
      micModelId: 'm1'
    })
    catalogue.findMany.mockResolvedValue([publishedMic] as never)
    const response = await deleteUnit(plain(), params({ unitId: 'unit_1' }))
    expect(response.status).toBe(204)
  })
})

describe('/api/admin/mics (platform admins only)', () => {
  const calls = () => [
    () => adminList(plain()),
    () => adminCreate(json('POST', {})),
    () => adminGetMic(plain(), params({ micId: 'm1' })),
    () => adminPatchMic(json('PATCH', {}), params({ micId: 'm1' })),
    () =>
      adminStatus(
        json('POST', { status: 'in_review' }),
        params({ micId: 'm1' })
      )
  ]

  it('401s when signed out', async () => {
    sessionFor(null)
    for (const call of calls()) expect((await call()).status).toBe(401)
  })

  it('404s for an organisation owner who is not a platform admin', async () => {
    sessionFor('owner@kigumi.test')
    for (const call of calls()) expect((await call()).status).toBe(404)
    expect(catalogue.findMany).not.toHaveBeenCalled()
  })

  it('404s when PLATFORM_ADMIN_EMAILS is unset', async () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', '')
    for (const call of calls()) expect((await call()).status).toBe(404)
  })

  it('lets an admin list the whole queue, drafts included', async () => {
    catalogue.findMany.mockResolvedValue([])
    const response = await adminList(
      new Request('http://localhost/api/admin/mics?status=draft')
    )
    expect(response.status).toBe(200)
    expect(whereOf(catalogue.findMany)).toMatchObject({
      status: 'draft'
    })
  })

  it('400s an admin sending an invalid microphone', async () => {
    const response = await adminCreate(json('POST', { manufacturer: 'X' }))
    expect(response.status).toBe(400)
  })

  it('404s an admin changing the status of an unknown microphone', async () => {
    catalogue.findUnique.mockResolvedValue(null)
    const response = await adminStatus(
      json('POST', { status: 'in_review' }),
      params({ micId: 'nope' })
    )
    expect(response.status).toBe(404)
  })
})
