import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DELETE as deleteLayout,
  GET as getLayout,
  PUT as putLayout
} from '@/app/api/dashboard/layout/route'
import { POST as resolveRoute } from '@/app/api/setup/resolve/route'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: {
    organization: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  }
}))

let db: FakeDb

const json = (method: string, body: unknown = {}) =>
  new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  vi.mocked(getTenantContext).mockResolvedValue(
    makeContext({ role: MemberRole.VIEWER })
  )
  db.dashboardPreference.findFirst.mockResolvedValue(null)
})

describe('dashboard layout routes', () => {
  it('returns null until a layout is saved', async () => {
    const response = await getLayout()
    expect(await response.json()).toEqual({ layout: null })
  })

  it('returns a stored layout and ignores a corrupt one', async () => {
    db.dashboardPreference.findFirst.mockResolvedValue({
      layout: { order: ['usage'], hidden: [] }
    })
    expect(await (await getLayout()).json()).toEqual({
      layout: { order: ['usage'], hidden: [] }
    })
    db.dashboardPreference.findFirst.mockResolvedValue({ layout: 'x' })
    expect(await (await getLayout()).json()).toEqual({ layout: null })
  })

  it('lets any member save their own layout (create then update)', async () => {
    const body = { order: ['usage', 'wizards'], hidden: ['usage'] }
    expect((await putLayout(json('PUT', body))).status).toBe(200)
    expect(db.dashboardPreference.create).toHaveBeenCalledTimes(1)
    db.dashboardPreference.findFirst.mockResolvedValue({ id: 'p1' })
    expect((await putLayout(json('PUT', body))).status).toBe(200)
    expect(db.dashboardPreference.updateMany).toHaveBeenCalledTimes(1)
  })

  it('rejects unknown tiles', async () => {
    const response = await putLayout(
      json('PUT', { order: ['nope'], hidden: [] })
    )
    expect(response.status).toBe(400)
  })

  it('resets to the default', async () => {
    expect((await deleteLayout()).status).toBe(200)
    expect(db.dashboardPreference.deleteMany).toHaveBeenCalled()
  })
})

describe('setup resolve route', () => {
  it('lets a manager finish or skip', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(
      makeContext({ role: MemberRole.MANAGER })
    )
    expect(
      (await resolveRoute(json('POST', { outcome: 'skipped' }))).status
    ).toBe(200)
  })

  it('forbids a viewer', async () => {
    const response = await resolveRoute(json('POST', { outcome: 'finished' }))
    expect(response.status).toBe(403)
  })

  it('rejects an unknown outcome', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(
      makeContext({ role: MemberRole.OWNER })
    )
    expect((await resolveRoute(json('POST', { outcome: 'x' }))).status).toBe(
      400
    )
  })
})
