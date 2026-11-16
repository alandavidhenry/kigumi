import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import {
  addUnit,
  addUnits,
  listLocker,
  listUnitsForModel,
  listUnlinkedMicrophones,
  removeUnit,
  updateUnit
} from '@/lib/mics/locker'
import { PlanTier, getPlanLimits } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: { microphoneModel: { findMany: vi.fn(), findFirst: vi.fn() } }
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
const catalogue = vi.mocked(prisma.microphoneModel, true)

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })

const model = {
  id: 'model_1',
  slug: 'shure-sm57',
  manufacturer: 'Shure',
  model: 'SM57',
  transducerType: 'dynamic',
  phantomSafe: null
}

const unitRow = (overrides = {}) => ({
  id: 'unit_1',
  micModelId: 'model_1',
  equipmentItemId: 'eq_1',
  serial: 'SN1',
  condition: 'good',
  matchedPairGroup: null,
  notes: null,
  equipmentItem: { status: 'in_service', room: { name: 'Live room' } },
  ...overrides
})

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  catalogue.findFirst.mockResolvedValue(model as never)
  catalogue.findMany.mockResolvedValue([model] as never)
})

describe('listLocker', () => {
  it('joins units to their catalogue model and derives availability', async () => {
    db.microphoneUnit.findMany.mockResolvedValue([
      unitRow(),
      unitRow({
        id: 'unit_2',
        equipmentItem: { status: 'repair', room: null }
      })
    ])
    const units = await listLocker(viewer)
    expect(units).toHaveLength(2)
    expect(units[0]).toMatchObject({
      manufacturer: 'Shure',
      model: 'SM57',
      roomName: 'Live room',
      available: true
    })
    expect(units[1]).toMatchObject({ available: false, roomName: null })
  })

  it('hides units whose model has gone from the catalogue', async () => {
    db.microphoneUnit.findMany.mockResolvedValue([unitRow()])
    catalogue.findMany.mockResolvedValue([])
    expect(await listLocker(viewer)).toEqual([])
  })

  it('filters by model for the mic page', async () => {
    db.microphoneUnit.findMany.mockResolvedValue([])
    await listUnitsForModel(viewer, 'model_1')
    expect(db.microphoneUnit.findMany.mock.calls[0][0]!.where).toEqual({
      micModelId: 'model_1'
    })
  })

  it('lists microphones not yet linked', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    await listUnlinkedMicrophones(viewer)
    expect(db.equipmentItem.findMany.mock.calls[0][0]!.where).toEqual({
      category: 'microphone',
      micUnit: null
    })
  })
})

describe('addUnit', () => {
  const input = { micModelId: 'model_1', serial: 'SN1' }

  it('creates the inventory item from the model when none is chosen', async () => {
    db.equipmentItem.count.mockResolvedValue(3)
    db.equipmentItem.create.mockResolvedValue({ id: 'eq_new' })
    db.microphoneUnit.create.mockResolvedValue(unitRow())
    const unit = await addUnit(owner, input)
    expect(db.equipmentItem.create.mock.calls[0][0]!.data).toMatchObject({
      category: 'microphone',
      make: 'Shure',
      model: 'SM57',
      organisationId: 'org_1'
    })
    expect(db.microphoneUnit.create.mock.calls[0][0]!.data).toMatchObject({
      micModelId: 'model_1',
      equipmentItemId: 'eq_new'
    })
    expect(unit.manufacturer).toBe('Shure')
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'mic_unit.create' })
    )
  })

  it('links an existing microphone item', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'eq_1',
      category: 'microphone',
      micUnit: null
    })
    db.microphoneUnit.create.mockResolvedValue(unitRow())
    await addUnit(owner, { ...input, equipmentItemId: 'eq_1' })
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
    expect(
      db.microphoneUnit.create.mock.calls[0][0]!.data.equipmentItemId
    ).toBe('eq_1')
  })

  it("404s for another organisation's item (tenantDb finds nothing)", async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectAppError(
      addUnit(owner, { ...input, equipmentItemId: 'other_org_item' }),
      'NOT_FOUND'
    )
    expect(db.microphoneUnit.create).not.toHaveBeenCalled()
  })

  it('refuses non-microphone items and items already linked', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'eq_1',
      category: 'preamp',
      micUnit: null
    })
    await expectAppError(
      addUnit(owner, { ...input, equipmentItemId: 'eq_1' }),
      'BAD_REQUEST'
    )
    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'eq_1',
      category: 'microphone',
      micUnit: { id: 'unit_9' }
    })
    await expectAppError(
      addUnit(owner, { ...input, equipmentItemId: 'eq_1' }),
      'BAD_REQUEST'
    )
  })

  it('404s for unpublished or unknown catalogue models', async () => {
    catalogue.findFirst.mockResolvedValue(null)
    await expectAppError(addUnit(owner, input), 'NOT_FOUND')
    expect(catalogue.findFirst.mock.calls[0][0]!.where).toMatchObject({
      status: 'published'
    })
  })

  it('counts a new inventory item against the plan limit', async () => {
    db.equipmentItem.count.mockResolvedValue(250)
    await expectAppError(
      addUnit(makeContext({ planTier: PlanTier.FREE }), input),
      'PLAN_LIMIT'
    )
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('does not count a linked existing item against the limit', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({
      id: 'eq_1',
      category: 'microphone',
      micUnit: null
    })
    db.microphoneUnit.create.mockResolvedValue(unitRow())
    await addUnit(makeContext({ planTier: PlanTier.FREE }), {
      ...input,
      equipmentItemId: 'eq_1'
    })
    expect(db.equipmentItem.count).not.toHaveBeenCalled()
  })

  it('rolls back the item it created if the unit cannot be saved', async () => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.equipmentItem.create.mockResolvedValue({ id: 'eq_new' })
    db.microphoneUnit.create.mockRejectedValue(new Error('boom'))
    await expect(addUnit(owner, input)).rejects.toThrow('boom')
    expect(db.equipmentItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'eq_new' }
    })
  })

  it('keeps matched pairs to one model and a small group', async () => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.microphoneUnit.findMany.mockResolvedValue([
      { micModelId: 'model_other' }
    ])
    await expectAppError(
      addUnit(owner, { ...input, matchedPairGroup: 'Pair A' }),
      'BAD_REQUEST'
    )
    db.microphoneUnit.findMany.mockResolvedValue([
      { micModelId: 'model_1' },
      { micModelId: 'model_1' }
    ])
    await expectAppError(
      addUnit(owner, { ...input, matchedPairGroup: 'Pair A' }),
      'BAD_REQUEST'
    )
  })

  it('is forbidden to viewers and validates before touching the database', async () => {
    await expectAppError(addUnit(viewer, input), 'FORBIDDEN')
    await expect(addUnit(owner, { condition: 'bad' })).rejects.toThrow()
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })
})

describe('updateUnit', () => {
  it('updates and audits', async () => {
    db.microphoneUnit.findFirst.mockResolvedValue({
      id: 'unit_1',
      micModelId: 'model_1'
    })
    db.microphoneUnit.findFirstOrThrow.mockResolvedValue(
      unitRow({ condition: 'fair' })
    )
    const unit = await updateUnit(owner, 'unit_1', { condition: 'fair' })
    expect(unit.condition).toBe('fair')
    expect(db.microphoneUnit.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'unit_1' },
      data: { condition: 'fair' }
    })
    expect(recordAudit).toHaveBeenCalled()
  })

  it('404s for a unit in another organisation', async () => {
    db.microphoneUnit.findFirst.mockResolvedValue(null)
    await expectAppError(
      updateUnit(owner, 'other_unit', { condition: 'fair' }),
      'NOT_FOUND'
    )
    expect(db.microphoneUnit.updateMany).not.toHaveBeenCalled()
  })

  it('is forbidden to viewers', async () => {
    await expectAppError(
      updateUnit(viewer, 'unit_1', { condition: 'fair' }),
      'FORBIDDEN'
    )
  })
})

describe('removeUnit', () => {
  it('removes only the unit', async () => {
    db.microphoneUnit.findFirst.mockResolvedValue({
      id: 'unit_1',
      micModelId: 'model_1'
    })
    await removeUnit(owner, 'unit_1')
    expect(db.microphoneUnit.deleteMany).toHaveBeenCalledWith({
      where: { id: 'unit_1' }
    })
    expect(db.equipmentItem.deleteMany).not.toHaveBeenCalled()
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'mic_unit.delete' })
    )
  })

  it('404s for a unit in another organisation and forbids viewers', async () => {
    db.microphoneUnit.findFirst.mockResolvedValue(null)
    await expectAppError(removeUnit(owner, 'other_unit'), 'NOT_FOUND')
    await expectAppError(removeUnit(viewer, 'unit_1'), 'FORBIDDEN')
  })
})

describe('addUnits', () => {
  beforeEach(() => {
    db.equipmentItem.count.mockResolvedValue(0)
    db.microphoneUnit.findMany.mockResolvedValue([])
    let n = 0
    db.equipmentItem.create.mockImplementation(async () => ({
      id: `eq_${++n}`
    }))
    db.microphoneUnit.create.mockImplementation(async () => ({
      id: `unit_${++n}`
    }))
  })

  it('creates every unit in one transaction with one audit row', async () => {
    db.room.findFirst.mockResolvedValue({ id: 'room_1' })
    const result = await addUnits(owner, {
      roomId: 'room_1',
      rows: [{ micModelId: 'model_1', quantity: 3 }]
    })
    expect(result.unitIds).toHaveLength(3)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.equipmentItem.create).toHaveBeenCalledTimes(3)
    expect(db.equipmentItem.create.mock.calls[0][0]!.data).toMatchObject({
      roomId: 'room_1',
      make: 'Shure'
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it('gives matched rows a unique group name', async () => {
    db.microphoneUnit.findMany.mockResolvedValue([
      { matchedPairGroup: 'Shure SM57 set 1' }
    ])
    await addUnits(owner, {
      rows: [{ micModelId: 'model_1', quantity: 2, matched: true }]
    })
    const groups = db.microphoneUnit.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { matchedPairGroup: string } }).data
          .matchedPairGroup
    )
    expect(groups).toEqual(['Shure SM57 set 2', 'Shure SM57 set 2'])
  })

  it('rejects matched rows outside 2 to 3 and oversize requests', async () => {
    for (const rows of [
      [{ micModelId: 'model_1', quantity: 1, matched: true }],
      [{ micModelId: 'model_1', quantity: 4, matched: true }],
      [{ micModelId: 'model_1', quantity: 13 }],
      Array.from({ length: 5 }, () => ({
        micModelId: 'model_1',
        quantity: 12
      })),
      []
    ]) {
      await expect(addUnits(owner, { rows })).rejects.toThrow()
    }
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('creates nothing when any model is unknown or unpublished', async () => {
    await expectAppError(
      addUnits(owner, {
        rows: [
          { micModelId: 'model_1', quantity: 1 },
          { micModelId: 'gone', quantity: 1 }
        ]
      }),
      'NOT_FOUND'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('checks the inventory limit for the whole batch up front', async () => {
    const free = makeContext({ planTier: PlanTier.FREE })
    db.equipmentItem.count.mockResolvedValue(
      getPlanLimits(free.planTier).inventoryItems - 1
    )
    await expectAppError(
      addUnits(free, { rows: [{ micModelId: 'model_1', quantity: 2 }] }),
      'PLAN_LIMIT'
    )
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('404s a room from another organisation', async () => {
    db.room.findFirst.mockResolvedValue(null)
    await expectAppError(
      addUnits(owner, {
        roomId: 'other',
        rows: [{ micModelId: 'model_1', quantity: 1 }]
      }),
      'NOT_FOUND'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('propagates a failure mid-transaction so the caller rolls back', async () => {
    db.microphoneUnit.create
      .mockReset()
      .mockResolvedValueOnce({ id: 'u1' })
      .mockRejectedValueOnce(new Error('boom'))
    await expect(
      addUnits(owner, { rows: [{ micModelId: 'model_1', quantity: 2 }] })
    ).rejects.toThrow('boom')
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('forbids viewers', async () => {
    await expectAppError(
      addUnits(viewer, { rows: [{ micModelId: 'model_1', quantity: 1 }] }),
      'FORBIDDEN'
    )
  })
})
