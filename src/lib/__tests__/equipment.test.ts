import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAttachments } from '@/lib/attachments'
import {
  createEquipment,
  deleteEquipment,
  getEquipment,
  listEquipment,
  updateEquipment
} from '@/lib/equipment'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/attachments', () => ({
  listAttachments: vi.fn(),
  deleteAttachmentsFor: vi.fn()
}))
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
const { deleteAttachmentsFor } = vi.mocked(await import('@/lib/attachments'))

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })
const freeOwner = makeContext({ planTier: PlanTier.FREE })

const raw = {
  id: 'e1',
  category: 'microphone',
  make: 'Neumann',
  model: 'U 87',
  serial: null,
  quantity: 1,
  status: 'in_service',
  roomId: null,
  purchaseDate: new Date('2024-03-12T00:00:00Z'),
  purchasePriceMinor: 250000,
  supplier: null,
  tags: ['vocal'],
  customFields: null,
  notes: null,
  room: { name: 'Live room' }
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
})

describe('listEquipment', () => {
  it('maps rows and applies filters to the query', async () => {
    db.equipmentItem.findMany.mockResolvedValue([raw])
    const rows = await listEquipment(viewer, {
      q: 'neu',
      category: 'microphone',
      status: 'in_service',
      tag: 'vocal'
    })
    expect(rows[0]).toMatchObject({
      id: 'e1',
      roomName: 'Live room',
      purchaseDate: '2024-03-12'
    })
    const { where } = db.equipmentItem.findMany.mock.calls[0][0]
    expect(where).toMatchObject({
      category: 'microphone',
      status: 'in_service',
      tags: { has: 'vocal' }
    })
    expect(where.OR).toHaveLength(5)
  })

  it('rejects an invalid filter', async () => {
    await expect(
      listEquipment(viewer, { category: 'toaster' })
    ).rejects.toThrow()
  })
})

describe('getEquipment', () => {
  it('returns the item with photos', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(raw)
    vi.mocked(listAttachments).mockResolvedValue([])
    expect(await getEquipment(viewer, 'e1')).toMatchObject({
      id: 'e1',
      photos: []
    })
  })

  it('404s when the item is not in this organisation', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectAppError(getEquipment(viewer, 'other'), 'NOT_FOUND')
  })
})

describe('createEquipment', () => {
  const input = { category: 'microphone', make: 'Neumann', model: 'U 87' }

  it('creates and audits', async () => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.equipmentItem.create.mockResolvedValue(raw)
    await createEquipment(owner, input)
    expect(db.equipmentItem.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      make: 'Neumann',
      quantity: 1,
      status: 'in_service'
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'equipment.create' })
    )
  })

  it('forbids viewers', async () => {
    await expectAppError(createEquipment(viewer, input), 'FORBIDDEN')
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('enforces the inventory limit', async () => {
    db.equipmentItem.count.mockResolvedValue(250)
    await expectAppError(createEquipment(freeOwner, input), 'PLAN_LIMIT')
  })

  it('404s when the room belongs to another organisation', async () => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.room.findFirst.mockResolvedValue(null)
    await expectAppError(
      createEquipment(owner, { ...input, roomId: 'foreign' }),
      'NOT_FOUND'
    )
  })

  it('rejects invalid input', async () => {
    await expect(createEquipment(owner, { make: '' })).rejects.toThrow()
  })
})

describe('updateEquipment', () => {
  it('updates and re-reads', async () => {
    db.equipmentItem.updateMany.mockResolvedValue({ count: 1 })
    db.equipmentItem.findFirstOrThrow.mockResolvedValue(raw)
    await updateEquipment(owner, 'e1', { status: 'repair', purchaseDate: null })
    expect(db.equipmentItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'repair', purchaseDate: null }
    })
  })

  it('404s across organisations', async () => {
    db.equipmentItem.updateMany.mockResolvedValue({ count: 0 })
    await expectAppError(
      updateEquipment(owner, 'x', { make: 'A' }),
      'NOT_FOUND'
    )
  })

  it('forbids viewers', async () => {
    await expectAppError(
      updateEquipment(viewer, 'e1', { make: 'A' }),
      'FORBIDDEN'
    )
  })
})

describe('deleteEquipment', () => {
  it('deletes the item and its attachments', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'e1',
      make: 'Neumann',
      model: 'U 87'
    })
    await deleteEquipment(owner, 'e1')
    expect(deleteAttachmentsFor).toHaveBeenCalledWith(owner, 'equipment', 'e1')
    expect(db.equipmentItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'e1' }
    })
    expect(recordAudit).toHaveBeenCalled()
  })

  it('404s across organisations', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectAppError(deleteEquipment(owner, 'x'), 'NOT_FOUND')
    expect(db.equipmentItem.deleteMany).not.toHaveBeenCalled()
  })

  it('forbids viewers', async () => {
    await expectAppError(deleteEquipment(viewer, 'e1'), 'FORBIDDEN')
  })
})
