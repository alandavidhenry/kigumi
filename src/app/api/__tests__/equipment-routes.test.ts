import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE as deleteAttachmentRoute } from '@/app/api/attachments/[attachmentId]/route'
import { POST as postPhoto } from '@/app/api/equipment/[equipmentId]/photos/route'
import {
  DELETE as deleteItem,
  GET as getItem,
  PATCH as patchItem
} from '@/app/api/equipment/[equipmentId]/route'
import { GET as exportRoute } from '@/app/api/equipment/export/route'
import { POST as importRoute } from '@/app/api/equipment/import/route'
import { GET as listRoute, POST as postItem } from '@/app/api/equipment/route'
import { GET as valuationRoute } from '@/app/api/equipment/valuation/route'
import { unauthorized } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers + real src/lib, with session, database and
// blob storage replaced.
vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  blobPathFor: () => 'p',
  uploadBlob: vi.fn(),
  downloadBlob: vi.fn(),
  deleteBlob: vi.fn()
}))

let db: FakeDb

function signInAs(role: MemberRole, planTier = PlanTier.STUDIO) {
  vi.mocked(getTenantContext).mockResolvedValue(makeContext({ role, planTier }))
}

function jsonRequest(method: string, body: unknown) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const item = { equipmentId: 'e1' }
const plain = () => new Request('http://localhost/api')

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
})

describe('/api/equipment', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    expect((await listRoute(plain())).status).toBe(401)
  })

  it('lists for viewers with query filters', async () => {
    signInAs(MemberRole.VIEWER)
    db.equipmentItem.findMany.mockResolvedValue([])
    const response = await listRoute(
      new Request('http://localhost/api/equipment?category=cable')
    )
    expect(response.status).toBe(200)
    expect(db.equipmentItem.findMany.mock.calls[0][0].where).toMatchObject({
      category: 'cable'
    })
  })

  it('400s on an invalid filter', async () => {
    const response = await listRoute(
      new Request('http://localhost/api/equipment?status=nope')
    )
    expect(response.status).toBe(400)
  })

  it('POST creates with 201, 400s on bad input, 403s for viewers', async () => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.equipmentItem.create.mockResolvedValue({
      id: 'e1',
      category: 'cable',
      make: 'Mogami',
      model: '2534',
      tags: [],
      room: null
    })
    const body = { category: 'cable', make: 'Mogami', model: '2534' }
    expect((await postItem(jsonRequest('POST', body))).status).toBe(201)
    expect((await postItem(jsonRequest('POST', { make: '' }))).status).toBe(400)
    signInAs(MemberRole.VIEWER)
    expect((await postItem(jsonRequest('POST', body))).status).toBe(403)
  })

  it('POST 403s past the plan limit', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    db.equipmentItem.count.mockResolvedValue(250)
    const response = await postItem(
      jsonRequest('POST', { category: 'cable', make: 'A', model: 'B' })
    )
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('PLAN_LIMIT')
  })
})

describe('/api/equipment/[equipmentId]', () => {
  it('GET 404s for an item in another organisation', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    expect((await getItem(plain(), params(item))).status).toBe(404)
  })

  it('PATCH 404s across organisations', async () => {
    db.equipmentItem.updateMany.mockResolvedValue({ count: 0 })
    expect(
      (await patchItem(jsonRequest('PATCH', { make: 'A' }), params(item)))
        .status
    ).toBe(404)
  })

  it('PATCH 404s when moving an item into a room from another organisation', async () => {
    db.room.findFirst.mockResolvedValue(null)
    const response = await patchItem(
      jsonRequest('PATCH', { roomId: 'foreign' }),
      params(item)
    )
    expect(response.status).toBe(404)
    expect(db.equipmentItem.updateMany).not.toHaveBeenCalled()
  })

  it('DELETE 404s across organisations, 204s on success, 403s for viewers', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    expect((await deleteItem(plain(), params(item))).status).toBe(404)

    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'e1',
      make: 'A',
      model: 'B'
    })
    db.attachment.findMany.mockResolvedValue([])
    expect((await deleteItem(plain(), params(item))).status).toBe(204)

    signInAs(MemberRole.VIEWER)
    expect((await deleteItem(plain(), params(item))).status).toBe(403)
  })
})

describe('photos and attachments', () => {
  it('400s without a file and 404s across organisations', async () => {
    const empty = new Request('http://localhost/api', {
      method: 'POST',
      body: new FormData()
    })
    expect((await postPhoto(empty, params(item))).status).toBe(400)

    const form = new FormData()
    form.append(
      'file',
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', {
        type: 'image/png'
      })
    )
    db.equipmentItem.findFirst.mockResolvedValue(null)
    const response = await postPhoto(
      new Request('http://localhost/api', { method: 'POST', body: form }),
      params(item)
    )
    expect(response.status).toBe(404)
  })

  it('DELETE attachment 404s across organisations', async () => {
    db.attachment.findFirst.mockResolvedValue(null)
    const response = await deleteAttachmentRoute(
      plain(),
      params({ attachmentId: 'a1' })
    )
    expect(response.status).toBe(404)
  })
})

describe('import, export and valuation', () => {
  it('exports CSV with a download header', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    const response = await exportRoute(plain())
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment')
  })

  it('import 400s with row details when the CSV is invalid', async () => {
    db.room.findMany.mockResolvedValue([])
    db.equipmentItem.count.mockResolvedValue(0)
    const response = await importRoute(
      new Request('http://localhost/api', {
        method: 'POST',
        body: 'category,make,model\nnope,A,B'
      })
    )
    expect(response.status).toBe(400)
    expect((await response.json()).details.errors[0].row).toBe(2)
  })

  it('import 403s for viewers', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await importRoute(
      new Request('http://localhost/api', {
        method: 'POST',
        body: 'category,make,model\nmic,A,B'
      })
    )
    expect(response.status).toBe(403)
  })

  it('valuation is plan-gated: Free 403s, Pro succeeds', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    const denied = await valuationRoute(plain())
    expect(denied.status).toBe(403)
    expect((await denied.json()).code).toBe('FEATURE_NOT_IN_PLAN')

    signInAs(MemberRole.OWNER, PlanTier.PRO)
    const ok = await valuationRoute(
      new Request('http://localhost/api/equipment/valuation?format=csv')
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/csv')
  })
})
