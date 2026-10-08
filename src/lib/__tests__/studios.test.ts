import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import {
  createRoom,
  createStudio,
  deleteRoom,
  deleteStudio,
  getOrganisationUsage,
  getStudio,
  listStudios,
  updateRoom,
  updateStudio
} from '@/lib/studios'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

const { recordAudit } = vi.mocked(await import('@/lib/audit'))

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })
const freeOwner = makeContext({ planTier: PlanTier.FREE })

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
})

describe('listStudios', () => {
  it('flattens room counts', async () => {
    db.studio.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'A',
        address: null,
        timezone: 'Europe/London',
        _count: { rooms: 3 }
      }
    ])
    expect(await listStudios(viewer)).toEqual([
      {
        id: 's1',
        name: 'A',
        address: null,
        timezone: 'Europe/London',
        roomCount: 3
      }
    ])
    expect(tenantDb).toHaveBeenCalledWith(viewer)
  })
})

describe('getStudio', () => {
  it('returns the studio with rooms', async () => {
    const studio = { id: 's1', name: 'A', rooms: [] }
    db.studio.findFirst.mockResolvedValue(studio)
    expect(await getStudio(viewer, 's1')).toBe(studio)
    expect(db.studio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } })
    )
  })

  it('404s when the studio is missing or in another organisation', async () => {
    db.studio.findFirst.mockResolvedValue(null)
    await expectAppError(getStudio(viewer, 'nope'), 'NOT_FOUND')
  })
})

describe('createStudio', () => {
  it('creates, audits and returns the studio', async () => {
    db.studio.count.mockResolvedValue(0)
    db.studio.create.mockResolvedValue({
      id: 's1',
      name: 'Abbey',
      address: null,
      timezone: 'Europe/London',
      notes: null
    })

    const studio = await createStudio(owner, { name: ' Abbey ' })

    expect(studio).toEqual(expect.objectContaining({ id: 's1', rooms: [] }))
    expect(db.studio.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Abbey',
          address: null,
          timezone: 'Europe/London',
          notes: null,
          organisationId: 'org_1'
        }
      })
    )
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'studio.create', entityId: 's1' })
    )
  })

  it('blocks viewers', async () => {
    await expectAppError(createStudio(viewer, { name: 'A' }), 'FORBIDDEN')
    expect(db.studio.create).not.toHaveBeenCalled()
  })

  it('enforces the plan limit', async () => {
    db.studio.count.mockResolvedValue(1)
    await expectAppError(createStudio(freeOwner, { name: 'A' }), 'PLAN_LIMIT')
    expect(db.studio.create).not.toHaveBeenCalled()
  })

  it('validates input before touching the database', async () => {
    await expect(createStudio(owner, { name: '' })).rejects.toThrow()
    expect(db.studio.count).not.toHaveBeenCalled()
  })
})

describe('updateStudio', () => {
  it('updates, audits and returns the studio', async () => {
    db.studio.updateMany.mockResolvedValue({ count: 1 })
    db.studio.findFirstOrThrow.mockResolvedValue({
      id: 's1',
      name: 'New',
      address: null,
      timezone: 'Europe/London',
      _count: { rooms: 2 }
    })

    const studio = await updateStudio(owner, 's1', { name: 'New' })

    expect(studio.roomCount).toBe(2)
    expect(db.studio.updateMany).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { name: 'New' }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        action: 'studio.update',
        metadata: { fields: ['name'] }
      })
    )
  })

  it('404s when nothing matched', async () => {
    db.studio.updateMany.mockResolvedValue({ count: 0 })
    await expectAppError(updateStudio(owner, 's1', { name: 'X' }), 'NOT_FOUND')
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('blocks viewers', async () => {
    await expectAppError(updateStudio(viewer, 's1', { name: 'X' }), 'FORBIDDEN')
  })
})

describe('deleteStudio', () => {
  it('deletes and audits', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'A' })
    await deleteStudio(owner, 's1')
    expect(db.studio.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'studio.delete' })
    )
  })

  it('404s when missing', async () => {
    db.studio.findFirst.mockResolvedValue(null)
    await expectAppError(deleteStudio(owner, 's1'), 'NOT_FOUND')
    expect(db.studio.deleteMany).not.toHaveBeenCalled()
  })
})

describe('createRoom', () => {
  const input = { name: 'Live', widthMm: 6000, lengthMm: 8000 }

  it('creates the room in the studio and audits', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'Abbey' })
    db.room.count.mockResolvedValue(0)
    db.room.create.mockResolvedValue({ id: 'r1', name: 'Live' })

    expect(await createRoom(owner, 's1', input)).toEqual({
      id: 'r1',
      name: 'Live'
    })
    expect(db.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Live',
          widthMm: 6000,
          lengthMm: 8000,
          notes: null,
          studioId: 's1',
          organisationId: 'org_1'
        }
      })
    )
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        action: 'room.create',
        summary: 'Created room Live in Abbey'
      })
    )
  })

  it('404s for a studio outside the organisation', async () => {
    db.studio.findFirst.mockResolvedValue(null)
    await expectAppError(createRoom(owner, 'other', input), 'NOT_FOUND')
    expect(db.room.create).not.toHaveBeenCalled()
  })

  it('counts rooms organisation-wide against the plan', async () => {
    db.studio.findFirst.mockResolvedValue({ id: 's1', name: 'Abbey' })
    db.room.count.mockResolvedValue(2)
    await expectAppError(createRoom(freeOwner, 's1', input), 'PLAN_LIMIT')
    expect(db.room.count).toHaveBeenCalledWith()
  })

  it('blocks viewers', async () => {
    await expectAppError(createRoom(viewer, 's1', input), 'FORBIDDEN')
  })
})

describe('updateRoom', () => {
  it('updates and audits', async () => {
    db.room.updateMany.mockResolvedValue({ count: 1 })
    db.room.findFirstOrThrow.mockResolvedValue({ id: 'r1', name: 'Booth' })
    expect(await updateRoom(owner, 'r1', { name: 'Booth' })).toEqual({
      id: 'r1',
      name: 'Booth'
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'room.update' })
    )
  })

  it('404s when nothing matched', async () => {
    db.room.updateMany.mockResolvedValue({ count: 0 })
    await expectAppError(updateRoom(owner, 'r1', { name: 'X' }), 'NOT_FOUND')
  })

  it('rejects invalid dimensions', async () => {
    await expect(updateRoom(owner, 'r1', { widthMm: 2 })).rejects.toThrow()
    expect(db.room.updateMany).not.toHaveBeenCalled()
  })
})

describe('deleteRoom', () => {
  it('deletes and audits', async () => {
    db.room.findFirst.mockResolvedValue({ id: 'r1', name: 'Booth' })
    await deleteRoom(owner, 'r1')
    expect(db.room.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1' } })
    expect(recordAudit).toHaveBeenCalled()
  })

  it('404s when missing', async () => {
    db.room.findFirst.mockResolvedValue(null)
    await expectAppError(deleteRoom(owner, 'r1'), 'NOT_FOUND')
  })

  it('blocks viewers', async () => {
    await expectAppError(deleteRoom(viewer, 'r1'), 'FORBIDDEN')
  })
})

describe('getOrganisationUsage', () => {
  it('counts studios and rooms', async () => {
    db.studio.count.mockResolvedValue(2)
    db.room.count.mockResolvedValue(5)
    expect(await getOrganisationUsage(viewer)).toEqual({ studios: 2, rooms: 5 })
  })
})
