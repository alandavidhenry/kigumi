import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DELETE as deleteRoute,
  PATCH as patchRoute
} from '@/app/api/session-templates/[templateId]/route'
import {
  GET as listRoute,
  POST as postRoute
} from '@/app/api/session-templates/route'
import { PlanTier } from '@/lib/plans'
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

let db: FakeDb

function signInAs(role: MemberRole, planTier = PlanTier.PRO) {
  vi.mocked(getTenantContext).mockResolvedValue(makeContext({ role, planTier }))
}

const json = (method: string, body: unknown = {}) =>
  new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
const params = { params: Promise.resolve({ templateId: 'theirs' }) }
const body = {
  name: 'Band',
  sources: [{ id: 's1', label: 'Kick', kind: 'kick_in' }]
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
  db.sessionTemplate.findMany.mockResolvedValue([])
  db.sessionTemplate.findFirst.mockResolvedValue(null)
  db.sessionTemplate.updateMany.mockResolvedValue({ count: 0 })
  db.sessionTemplate.create.mockResolvedValue({ id: 'st1' })
})

describe('session template routes', () => {
  it('lists (200) and creates (201) on Pro', async () => {
    expect((await listRoute()).status).toBe(200)
    const response = await postRoute(json('POST', body))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ template: { id: 'st1' } })
  })

  it('gives Free a plan error on every route', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    for (const response of [
      await listRoute(),
      await postRoute(json('POST', body)),
      await patchRoute(json('PATCH', { name: 'N' }), params),
      await deleteRoute(new Request('http://x'), params)
    ]) {
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('FEATURE_NOT_IN_PLAN')
    }
  })

  it('404s for another organisation template and layout', async () => {
    expect(
      (await patchRoute(json('PATCH', { name: 'N' }), params)).status
    ).toBe(404)
    expect((await deleteRoute(new Request('http://x'), params)).status).toBe(
      404
    )
    db.layout.findFirst.mockResolvedValue(null)
    expect(
      (await postRoute(json('POST', { ...body, layoutId: 'theirs' }))).status
    ).toBe(404)
  })

  it('400s on invalid input and 403s viewers', async () => {
    expect((await postRoute(json('POST', { name: '' }))).status).toBe(400)
    signInAs(MemberRole.VIEWER)
    expect((await postRoute(json('POST', body))).status).toBe(403)
  })

  it('returns 204 on rename and delete of an own template', async () => {
    db.sessionTemplate.updateMany.mockResolvedValue({ count: 1 })
    expect(
      (await patchRoute(json('PATCH', { name: 'N' }), params)).status
    ).toBe(204)
    db.sessionTemplate.findFirst.mockResolvedValue({
      name: 'T',
      layoutId: null
    })
    expect((await deleteRoute(new Request('http://x'), params)).status).toBe(
      204
    )
  })
})
