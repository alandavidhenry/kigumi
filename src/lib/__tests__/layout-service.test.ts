import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import {
  deleteTemplate,
  getLayout,
  listTemplates,
  matchRoomSize,
  renameTemplate,
  saveLayout,
  saveTemplate
} from '@/lib/layout/service'
import { PlanTier } from '@/lib/plans'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/tenant-context', async () => {
  const { featureNotInPlan, forbidden } = await import('@/lib/errors')
  const { Feature, hasFeature } = await import('@/lib/plans')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    },
    requireFeature: (ctx: { planTier: string }, feature: string) => {
      if (!hasFeature(ctx.planTier, feature as never)) {
        throw featureNotInPlan(String(feature), 'Pro')
      }
      void Feature
    }
  }
})

const { recordAudit } = vi.mocked(await import('@/lib/audit'))

let db: FakeDb
const owner = makeContext()
const engineer = makeContext({ role: MemberRole.ENGINEER })
const viewer = makeContext({ role: MemberRole.VIEWER })
const free = makeContext({ planTier: PlanTier.FREE })

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

const stored = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id: 'l1',
  name: 'Tracking',
  version: 3,
  sessionId: 's1',
  isTemplate: false,
  items: [
    { id: 'a', type: 'mic', micUnitId: 'u1' },
    { id: 'b', type: 'amp', micUnitId: null }
  ],
  ...overrides
})

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'mic',
  xMm: 1000,
  yMm: 1000,
  widthMm: 100,
  depthMm: 100,
  ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.layout.updateMany.mockResolvedValue({ count: 1 })
  db.layoutItem.findMany.mockResolvedValue([])
  db.inputChannel.findMany.mockResolvedValue([])
  db.microphoneUnit.findMany.mockResolvedValue([])
  db.microphoneUnit.count.mockResolvedValue(1)
  db.equipmentItem.count.mockResolvedValue(1)
  db.layout.findFirstOrThrow.mockResolvedValue({
    id: 'l1',
    name: 'Tracking',
    widthMm: 5000,
    lengthMm: 4000,
    heightMm: null,
    gridMm: 500,
    snapMm: 50,
    version: 4,
    items: []
  })
})

describe('getLayout', () => {
  it('is readable by a viewer and 404s for another organisation', async () => {
    db.layout.findFirst.mockResolvedValueOnce(null)
    await expectCode(getLayout(viewer, 'other'), 'NOT_FOUND')
    db.layout.findFirst.mockResolvedValueOnce({
      id: 'l1',
      name: 'x',
      widthMm: 1,
      lengthMm: 1,
      heightMm: null,
      gridMm: 500,
      snapMm: 50,
      version: 1,
      items: [],
      sessionId: 's1',
      isTemplate: false
    })
    expect((await getLayout(viewer, 'l1')).sessionId).toBe('s1')
  })

  it('gates a template behind the plan', async () => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      items: [],
      isTemplate: true
    })
    await expectCode(getLayout(free, 'l1'), 'FEATURE_NOT_IN_PLAN')
  })
})

describe('saveLayout', () => {
  it('needs permission to manage sessions', async () => {
    await expectCode(
      saveLayout(viewer, 'l1', { version: 3, items: [] }),
      'FORBIDDEN'
    )
  })

  it('validates the payload before touching the database', async () => {
    await expect(
      saveLayout(engineer, 'l1', {
        version: 3,
        items: [item('a', { widthMm: 1 })]
      })
    ).rejects.toThrow()
    expect(db.layout.findFirst).not.toHaveBeenCalled()
  })

  it('404s for a layout in another organisation', async () => {
    db.layout.findFirst.mockResolvedValue(null)
    await expectCode(
      saveLayout(engineer, 'other', { version: 1, items: [] }),
      'NOT_FOUND'
    )
  })

  it('returns 409 for a stale version and writes nothing', async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    await expectCode(
      saveLayout(engineer, 'l1', { version: 2, items: [] }),
      'CONFLICT'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('returns 409 when the version moved between the read and the write', async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    db.layout.updateMany.mockResolvedValue({ count: 0 })
    await expectCode(
      saveLayout(engineer, 'l1', { version: 3, items: [item('a'), item('b')] }),
      'CONFLICT'
    )
    expect(db.layoutItem.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an unknown id that is not a new item', async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    await expectCode(
      saveLayout(engineer, 'l1', {
        version: 3,
        items: [item('a'), item('b'), item('ghost')]
      }),
      'CONFLICT'
    )
  })

  it("404s when a microphone unit isn't in this organisation", async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    db.microphoneUnit.count.mockResolvedValue(0)
    await expectCode(
      saveLayout(engineer, 'l1', {
        version: 3,
        items: [item('a', { micUnitId: 'foreign' }), item('b')]
      }),
      'NOT_FOUND'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('writes only the items whose values changed', async () => {
    // Stored rows as the database holds them (schema defaults filled in).
    const row = (id: string, extra: Record<string, unknown> = {}) => ({
      ...item(id),
      variant: null,
      label: null,
      zMm: 0,
      rotationDeg: 0,
      pitchDeg: 0,
      heightMm: null,
      sortOrder: 0,
      locked: false,
      groupId: null,
      micUnitId: null,
      equipmentItemId: null,
      patternSetting: null,
      showPattern: false,
      recommendationRef: null,
      notes: null,
      ...extra
    })
    db.layout.findFirst.mockResolvedValue(
      stored({ items: [row('a'), row('b'), row('c')] })
    )
    await saveLayout(engineer, 'l1', {
      version: 3,
      items: [item('a'), item('b', { xMm: 1500 }), item('c')]
    })
    expect(db.layoutItem.updateMany).toHaveBeenCalledTimes(1)
    expect(db.layoutItem.updateMany.mock.calls[0][0].where).toEqual({
      id: 'b',
      layoutId: 'l1'
    })

    vi.mocked(db.layoutItem.updateMany).mockClear()
    await saveLayout(engineer, 'l1', {
      version: 3,
      items: [item('a'), item('b'), item('c')]
    })
    expect(db.layoutItem.updateMany).not.toHaveBeenCalled()
  })

  it('a pure move writes the items and syncs, but is not audited', async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    const result = await saveLayout(engineer, 'l1', {
      version: 3,
      items: [
        item('a', { xMm: 2000, micUnitId: 'u1' }),
        item('b', { type: 'amp' })
      ]
    })
    expect(db.layoutItem.updateMany).toHaveBeenCalledTimes(2)
    expect(db.layoutItem.createMany).not.toHaveBeenCalled()
    expect(db.layoutItem.deleteMany).not.toHaveBeenCalled()
    expect(db.layout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1', version: 3 },
        data: expect.objectContaining({ version: { increment: 1 } })
      })
    )
    // The input list is reconciled in the same transaction.
    expect(db.layoutItem.findMany).toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
    expect(result.idMap).toEqual({})
    expect(result.layout.version).toBe(4)
  })

  it('adds new items with server ids, removes channels with removed items, and audits', async () => {
    db.layout.findFirst.mockResolvedValue(stored())
    const result = await saveLayout(engineer, 'l1', {
      version: 3,
      items: [item('a', { micUnitId: 'u1' }), item('new_1', { label: 'Snare' })]
    })
    const [tempId, realId] = Object.entries(result.idMap)[0]
    expect(tempId).toBe('new_1')
    expect(realId).not.toBe('new_1')

    const created = db.layoutItem.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      id: realId,
      layoutId: 'l1',
      organisationId: 'org_1',
      label: 'Snare'
    })
    expect(db.inputChannel.deleteMany).toHaveBeenCalledWith({
      where: { layoutItemId: { in: ['b'] } }
    })
    expect(db.layoutItem.deleteMany).toHaveBeenCalledWith({
      where: { layoutId: 'l1', id: { in: ['b'] } }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({
        action: 'layout.update',
        metadata: { added: 1, removed: 1, unitChanged: 0 }
      })
    )
  })

  it('creates channels for new mics through the reconcile', async () => {
    db.layout.findFirst.mockResolvedValue(stored({ items: [] }))
    db.layoutItem.findMany.mockResolvedValue([
      { id: 'made', type: 'mic', label: 'Snare', micUnitId: null }
    ])
    await saveLayout(engineer, 'l1', {
      version: 3,
      items: [item('new_1', { label: 'Snare' })]
    })
    expect(db.inputChannel.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          layoutItemId: 'made',
          number: 1,
          sessionId: 's1',
          organisationId: 'org_1',
          source: 'Snare'
        })
      ]
    })
  })

  it('does not reconcile a template (it has no input list)', async () => {
    db.layout.findFirst.mockResolvedValue(
      stored({ sessionId: null, isTemplate: true })
    )
    await saveLayout(engineer, 'l1', {
      version: 3,
      items: [item('a'), item('b')]
    })
    expect(db.inputChannel.createMany).not.toHaveBeenCalled()
    expect(db.layoutItem.findMany).not.toHaveBeenCalled()
  })

  it('refuses a template on the Free plan', async () => {
    db.layout.findFirst.mockResolvedValue(
      stored({ sessionId: null, isTemplate: true })
    )
    await expectCode(
      saveLayout(makeContext({ planTier: PlanTier.FREE }), 'l1', {
        version: 3,
        items: []
      }),
      'FEATURE_NOT_IN_PLAN'
    )
  })
})

describe('matchRoomSize', () => {
  it('copies the room footprint and bumps the version', async () => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'Tracking',
      isTemplate: false,
      roomId: null,
      session: { roomId: 'r1' }
    })
    db.room.findFirst.mockResolvedValue({
      widthMm: 7000,
      lengthMm: 5000,
      heightMm: 3000
    })
    await matchRoomSize(engineer, 'l1')
    expect(db.layout.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: {
        widthMm: 7000,
        lengthMm: 5000,
        heightMm: 3000,
        version: { increment: 1 }
      }
    })
  })

  it('says so when there is no room, and 404s across organisations', async () => {
    db.layout.findFirst.mockResolvedValueOnce({
      id: 'l1',
      name: 'x',
      isTemplate: false,
      roomId: null,
      session: { roomId: null }
    })
    await expectCode(matchRoomSize(engineer, 'l1'), 'BAD_REQUEST')
    db.layout.findFirst.mockResolvedValueOnce(null)
    await expectCode(matchRoomSize(engineer, 'other'), 'NOT_FOUND')
  })
})

describe('templates', () => {
  it('are a Pro feature to list, save, rename and delete', async () => {
    await expectCode(listTemplates(free), 'FEATURE_NOT_IN_PLAN')
    await expectCode(
      saveTemplate(free, { name: 'T', fromSessionId: 's1' }),
      'FEATURE_NOT_IN_PLAN'
    )
    await expectCode(
      renameTemplate(free, 'l1', { name: 'T' }),
      'FEATURE_NOT_IN_PLAN'
    )
    await expectCode(deleteTemplate(free, 'l1'), 'FEATURE_NOT_IN_PLAN')
  })

  it('are read-only for a viewer to change', async () => {
    await expectCode(
      saveTemplate(viewer, { name: 'T', fromSessionId: 's1' }),
      'FORBIDDEN'
    )
    await expectCode(deleteTemplate(viewer, 'l1'), 'FORBIDDEN')
  })

  it('lists with counts', async () => {
    db.layout.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Band',
        widthMm: 5000,
        lengthMm: 4000,
        room: { name: 'Live room' },
        _count: { items: 7 }
      }
    ])
    expect(await listTemplates(owner)).toEqual([
      {
        id: 't1',
        name: 'Band',
        widthMm: 5000,
        lengthMm: 4000,
        itemCount: 7,
        roomName: 'Live room'
      }
    ])
  })

  it("saves a session's layout as a template without units or links", async () => {
    db.layout.findFirst.mockResolvedValue({
      widthMm: 5000,
      lengthMm: 4000,
      heightMm: null,
      gridMm: 500,
      snapMm: 50,
      roomId: null,
      session: { roomId: 'r1' },
      items: [
        {
          id: 'i1',
          type: 'mic',
          label: 'Vocal',
          micUnitId: 'u1',
          equipmentItemId: 'e1',
          recommendationRef: 'r:s1:0',
          xMm: 1,
          yMm: 2
        }
      ]
    })
    db.layout.create.mockResolvedValue({ id: 't1' })
    const result = await saveTemplate(owner, {
      name: 'Vocal setup',
      fromSessionId: 's1'
    })
    expect(result).toMatchObject({ id: 't1', itemCount: 1 })
    expect(db.layout.create.mock.calls[0][0].data).toMatchObject({
      isTemplate: true,
      sessionId: null,
      organisationId: 'org_1'
    })
    const copied = db.layoutItem.createMany.mock.calls[0][0].data[0]
    expect(copied).toMatchObject({
      micUnitId: null,
      equipmentItemId: null,
      recommendationRef: null,
      label: 'Vocal',
      layoutId: 't1',
      organisationId: 'org_1'
    })
    expect(copied).not.toHaveProperty('id')
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'template.create' })
    )
  })

  it('404s for a session or template in another organisation', async () => {
    db.layout.findFirst.mockResolvedValue(null)
    await expectCode(
      saveTemplate(owner, { name: 'T', fromSessionId: 'other' }),
      'NOT_FOUND'
    )
    db.layout.updateMany.mockResolvedValue({ count: 0 })
    await expectCode(renameTemplate(owner, 'other', { name: 'T' }), 'NOT_FOUND')
    await expectCode(deleteTemplate(owner, 'other'), 'NOT_FOUND')
  })

  it('renames and deletes', async () => {
    await renameTemplate(owner, 't1', { name: 'New' })
    expect(db.layout.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', isTemplate: true },
      data: { name: 'New' }
    })
    db.layout.findFirst.mockResolvedValue({ name: 'Band' })
    db.layout.deleteMany.mockResolvedValue({ count: 1 })
    await deleteTemplate(owner, 't1')
    expect(db.layout.deleteMany).toHaveBeenCalledWith({
      where: { id: 't1', isTemplate: true }
    })
    expect(recordAudit).toHaveBeenLastCalledWith(
      owner,
      expect.objectContaining({ action: 'template.delete' })
    )
  })
})
