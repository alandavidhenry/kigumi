import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DELETE as deleteRoomRoute,
  PATCH as patchRoom
} from '@/app/api/rooms/[roomId]/route'
import { POST as postRoom } from '@/app/api/studios/[studioId]/rooms/route'
import {
  DELETE as deleteStudioRoute,
  GET as getStudioRoute,
  PATCH as patchStudio
} from '@/app/api/studios/[studioId]/route'
import {
  GET as listStudiosRoute,
  POST as postStudio
} from '@/app/api/studios/route'
import { unauthorized } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

// Integration: real route handlers + real src/lib/studios.ts, with the session
// and database replaced. Tenant scoping itself is covered in tenant-scope tests.
vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))

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

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  signInAs(MemberRole.OWNER)
})

describe('GET /api/studios', () => {
  it('401s when signed out', async () => {
    vi.mocked(getTenantContext).mockRejectedValue(unauthorized())
    const response = await listStudiosRoute()
    expect(response.status).toBe(401)
  })

  it('lists studios for any member', async () => {
    signInAs(MemberRole.VIEWER)
    db.studio.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'A',
        address: null,
        timezone: 'UTC',
        _count: { rooms: 1 }
      }
    ])
    const response = await listStudiosRoute()
    expect(response.status).toBe(200)
    expect((await response.json()).studios[0]).toMatchObject({ roomCount: 1 })
  })
})

describe('POST /api/studios', () => {
  it('creates a studio', async () => {
    db.studio.count.mockResolvedValue(0)
    db.studio.create.mockResolvedValue({ id: 's1', name: 'Abbey' })
    const response = await postStudio(jsonRequest('POST', { name: 'Abbey' }))
    expect(response.status).toBe(201)
    expect((await response.json()).studio).toMatchObject({ id: 's1' })
  })

  it('400s on invalid input', async () => {
    const response = await postStudio(jsonRequest('POST', { name: '' }))
    expect(response.status).toBe(400)
    expect((await response.json()).details[0].path).toBe('name')
  })

  it('403s for engineers', async () => {
    signInAs(MemberRole.ENGINEER)
    const response = await postStudio(jsonRequest('POST', { name: 'A' }))
    expect(response.status).toBe(403)
    expect(db.studio.create).not.toHaveBeenCalled()
  })

  it('403s with PLAN_LIMIT past the plan', async () => {
    signInAs(MemberRole.OWNER, PlanTier.FREE)
    db.studio.count.mockResolvedValue(1)
    const response = await postStudio(jsonRequest('POST', { name: 'A' }))
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('PLAN_LIMIT')
  })
})

describe('/api/studios/[studioId]', () => {
  it('GET returns the studio', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'A', rooms: [] })
    const response = await getStudioRoute(
      new Request('http://x'),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(200)
  })

  it('GET 404s for a studio in another organisation', async () => {
    db.studio.findFirst.mockResolvedValue(null)
    const response = await getStudioRoute(
      new Request('http://x'),
      params({ studioId: 'foreign' })
    )
    expect(response.status).toBe(404)
  })

  it('PATCH updates', async () => {
    db.studio.updateMany.mockResolvedValue({ count: 1 })
    db.studio.findFirstOrThrow.mockResolvedValue({
      id: 's1',
      name: 'New',
      address: null,
      timezone: 'UTC',
      _count: { rooms: 0 }
    })
    const response = await patchStudio(
      jsonRequest('PATCH', { name: 'New' }),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(200)
    expect((await response.json()).studio.name).toBe('New')
  })

  it('PATCH 404s across organisations', async () => {
    db.studio.updateMany.mockResolvedValue({ count: 0 })
    const response = await patchStudio(
      jsonRequest('PATCH', { name: 'New' }),
      params({ studioId: 'foreign' })
    )
    expect(response.status).toBe(404)
  })

  it('DELETE returns 204', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'A' })
    const response = await deleteStudioRoute(
      new Request('http://x', { method: 'DELETE' }),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(204)
  })

  it('DELETE 403s for viewers', async () => {
    signInAs(MemberRole.VIEWER)
    const response = await deleteStudioRoute(
      new Request('http://x', { method: 'DELETE' }),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /api/studios/[studioId]/rooms', () => {
  const room = { name: 'Live', widthMm: 6000, lengthMm: 8000 }

  it('creates a room', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'A' })
    db.room.count.mockResolvedValue(0)
    db.room.create.mockResolvedValue({ id: 'r1', ...room })
    const response = await postRoom(
      jsonRequest('POST', room),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(201)
  })

  it('404s for a studio in another organisation', async () => {
    db.studio.findFirst.mockResolvedValue(null)
    const response = await postRoom(
      jsonRequest('POST', room),
      params({ studioId: 'foreign' })
    )
    expect(response.status).toBe(404)
  })

  it('400s on bad dimensions', async () => {
    const response = await postRoom(
      jsonRequest('POST', { ...room, widthMm: 'six' }),
      params({ studioId: 's1' })
    )
    expect(response.status).toBe(400)
  })
})

describe('/api/rooms/[roomId]', () => {
  it('PATCH updates a room', async () => {
    db.room.updateMany.mockResolvedValue({ count: 1 })
    db.room.findFirstOrThrow.mockResolvedValue({ id: 'r1', name: 'Booth' })
    const response = await patchRoom(
      jsonRequest('PATCH', { name: 'Booth' }),
      params({ roomId: 'r1' })
    )
    expect(response.status).toBe(200)
  })

  it('PATCH 404s across organisations', async () => {
    db.room.updateMany.mockResolvedValue({ count: 0 })
    const response = await patchRoom(
      jsonRequest('PATCH', { name: 'Booth' }),
      params({ roomId: 'foreign' })
    )
    expect(response.status).toBe(404)
  })

  it('DELETE returns 204', async () => {
    db.room.findFirst.mockResolvedValue({ id: 'r1', name: 'Booth' })
    const response = await deleteRoomRoute(
      new Request('http://x', { method: 'DELETE' }),
      params({ roomId: 'r1' })
    )
    expect(response.status).toBe(204)
  })

  it('DELETE 403s for engineers', async () => {
    signInAs(MemberRole.ENGINEER)
    const response = await deleteRoomRoute(
      new Request('http://x', { method: 'DELETE' }),
      params({ roomId: 'r1' })
    )
    expect(response.status).toBe(403)
  })
})
