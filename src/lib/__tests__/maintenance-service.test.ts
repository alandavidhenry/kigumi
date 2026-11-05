import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteAttachmentsFor, storePhoto } from '@/lib/attachments'
import { AppError } from '@/lib/errors'
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead
} from '@/lib/maintenance/notifications'
import {
  createPatTest,
  deletePatTest,
  listPatStatus,
  updatePatTest
} from '@/lib/maintenance/pat'
import {
  addLogFile,
  completeTask,
  createLogEntry,
  createPlan,
  deleteLogEntry,
  deletePlan,
  listLog,
  listPlans,
  listTasks,
  setUsageHours,
  updatePlan
} from '@/lib/maintenance/service'
import {
  addWarrantyFile,
  createWarranty,
  deleteWarranty,
  listWarranties,
  updateWarranty
} from '@/lib/maintenance/warranty'
import { PlanTier } from '@/lib/plans'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/attachments', () => ({
  deleteAttachmentsFor: vi.fn(),
  storePhoto: vi.fn()
}))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  const { requireFeature } = await vi.importActual<
    typeof import('@/lib/tenant-context')
  >('@/lib/tenant-context')
  return {
    requireFeature,
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

const { recordAudit } = vi.mocked(await import('@/lib/audit'))

let db: FakeDb
const owner = makeContext() // Studio plan
const engineer = makeContext({ role: MemberRole.ENGINEER })
const viewer = makeContext({ role: MemberRole.VIEWER })
const free = makeContext({ planTier: PlanTier.FREE })
const pro = makeContext({ planTier: PlanTier.PRO })

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const item = { make: 'Neumann', model: 'U 87' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.usageCounter.findMany.mockResolvedValue([])
  db.attachment.findMany.mockResolvedValue([])
})

describe('plans', () => {
  const rawPlan = {
    id: 'p1',
    title: 'Clean',
    notes: null,
    equipmentItemId: 'e1',
    category: null,
    intervalDays: 90,
    intervalHours: null,
    leadDays: 14,
    active: true,
    startsOn: null,
    createdAt: d('2026-01-01'),
    equipmentItem: item,
    _count: { tasks: 1 }
  }

  it('viewers read plans but cannot create, update or delete', async () => {
    db.maintenancePlan.findMany.mockResolvedValue([rawPlan])
    expect(await listPlans(viewer)).toHaveLength(1)
    const input = { title: 'Clean', equipmentItemId: 'e1', intervalDays: 90 }
    await expectCode(createPlan(viewer, input), 'FORBIDDEN')
    await expectCode(updatePlan(viewer, 'p1', { title: 'x' }), 'FORBIDDEN')
    await expectCode(deletePlan(viewer, 'p1'), 'FORBIDDEN')
  })

  it('creates a plan for one item with a task due after the interval', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1' })
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'e1' }])
    db.maintenancePlan.create.mockResolvedValue(rawPlan)
    db.maintenanceTask.findMany.mockResolvedValue([])

    const row = await createPlan(engineer, {
      title: 'Clean',
      equipmentItemId: 'e1',
      intervalDays: 90
    })

    expect(row).toMatchObject({ id: 'p1', itemName: 'Neumann U 87' })
    expect(db.maintenancePlan.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      equipmentItemId: 'e1',
      category: null,
      intervalDays: 90
    })
    const [{ data }] = db.maintenanceTask.createMany.mock.calls[0]
    expect(data).toEqual([
      expect.objectContaining({
        organisationId: 'org_1',
        planId: 'p1',
        equipmentItemId: 'e1',
        dueAt: d('2026-04-01'),
        dueHours: null
      })
    ])
    expect(recordAudit).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({ action: 'maintenance_plan.create' })
    )
  })

  it('a category plan covers every live item in the category, once each', async () => {
    db.maintenancePlan.create.mockResolvedValue({
      ...rawPlan,
      equipmentItemId: null,
      category: 'microphone',
      equipmentItem: null
    })
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
    db.maintenanceTask.findMany.mockResolvedValue([
      { id: 't1', equipmentItemId: 'e1', lastDoneAt: null }
    ])

    await createPlan(owner, {
      title: 'Clean',
      category: 'microphone',
      intervalDays: 30
    })

    // Retired items are excluded by the query, and an item with a task is skipped.
    expect(db.equipmentItem.findMany.mock.calls[0][0].where).toEqual({
      status: { not: 'retired' },
      category: 'microphone'
    })
    const [{ data }] = db.maintenanceTask.createMany.mock.calls[0]
    expect(data).toHaveLength(1)
    expect(data[0].equipmentItemId).toBe('e2')
  })

  it('404s when the item is not in this organisation', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(
      createPlan(owner, {
        title: 'x',
        equipmentItemId: 'nope',
        intervalDays: 5
      }),
      'NOT_FOUND'
    )
    expect(db.maintenancePlan.create).not.toHaveBeenCalled()
  })

  it('usage-hour plans need the Studio plan; time plans do not', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1' })
    db.equipmentItem.findMany.mockResolvedValue([])
    db.maintenancePlan.create.mockResolvedValue(rawPlan)
    db.maintenanceTask.findMany.mockResolvedValue([])
    const hours = { title: 'Valves', equipmentItemId: 'e1', intervalHours: 500 }

    await expectCode(createPlan(free, hours), 'FEATURE_NOT_IN_PLAN')
    await expectCode(createPlan(pro, hours), 'FEATURE_NOT_IN_PLAN')
    await expect(createPlan(owner, hours)).resolves.toBeDefined()
    await expect(
      createPlan(free, { title: 'x', equipmentItemId: 'e1', intervalDays: 30 })
    ).resolves.toBeDefined()
  })

  it('a usage-hour task starts from the hours the item already has', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1' })
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'e1' }])
    db.maintenancePlan.create.mockResolvedValue({
      ...rawPlan,
      intervalDays: null,
      intervalHours: 500
    })
    db.maintenanceTask.findMany.mockResolvedValue([])
    db.usageCounter.findMany.mockResolvedValue([
      { equipmentItemId: 'e1', hours: 120 }
    ])
    await createPlan(owner, {
      title: 'Valves',
      equipmentItemId: 'e1',
      intervalHours: 500
    })
    expect(
      db.maintenanceTask.createMany.mock.calls[0][0].data[0]
    ).toMatchObject({ dueAt: null, dueHours: 620 })
  })

  it('update recomputes tasks only when the schedule changed', async () => {
    db.maintenancePlan.findFirst.mockResolvedValue(rawPlan)
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'e1' }])
    db.maintenanceTask.findMany.mockResolvedValue([
      { id: 't1', equipmentItemId: 'e1', lastDoneAt: d('2026-02-01') }
    ])

    await updatePlan(engineer, 'p1', { title: 'Deep clean' })
    expect(db.maintenanceTask.updateMany).not.toHaveBeenCalled()

    await updatePlan(engineer, 'p1', { intervalDays: 30 })
    expect(db.maintenanceTask.updateMany).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { dueAt: d('2026-03-03'), dueHours: null }
    })
  })

  it('update refuses to leave a plan with no interval, and 404s on a foreign id', async () => {
    db.maintenancePlan.findFirst.mockResolvedValue(rawPlan)
    await expectCode(
      updatePlan(owner, 'p1', { intervalDays: null }),
      'BAD_REQUEST'
    )
    db.maintenancePlan.findFirst.mockResolvedValue(null)
    await expectCode(updatePlan(owner, 'x', { title: 'a' }), 'NOT_FOUND')
    await expectCode(deletePlan(owner, 'x'), 'NOT_FOUND')
    expect(db.maintenancePlan.deleteMany).not.toHaveBeenCalled()
  })

  it('delete removes the plan and audits it', async () => {
    db.maintenancePlan.findFirst.mockResolvedValue({ id: 'p1', title: 'Clean' })
    await deletePlan(owner, 'p1')
    expect(db.maintenancePlan.deleteMany).toHaveBeenCalledWith({
      where: { id: 'p1' }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'maintenance_plan.delete' })
    )
  })
})

describe('tasks', () => {
  const task = (id: string, dueAt: string | null, over = {}) => ({
    id,
    planId: 'p1',
    equipmentItemId: `e-${id}`,
    dueAt: dueAt ? d(dueAt) : null,
    dueHours: null,
    lastDoneAt: null,
    plan: {
      title: 'Clean',
      intervalDays: 90,
      intervalHours: null,
      leadDays: 14
    },
    equipmentItem: { ...item, category: 'microphone' },
    ...over
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(d('2026-06-01'))
  })

  it('lists what needs attention, overdue first, and the rest on request', async () => {
    db.maintenanceTask.findMany.mockResolvedValue([
      task('soon', '2026-06-10'),
      task('fine', '2026-12-01'),
      task('late', '2026-05-01'),
      task('later', '2026-05-20')
    ])
    const attention = await listTasks(viewer)
    expect(attention.map((t) => t.id)).toEqual(['late', 'later', 'soon'])
    expect(attention[0]).toMatchObject({ state: 'overdue', daysLeft: -31 })
    expect(
      (await listTasks(viewer, { scope: 'all' })).map((t) => t.id)
    ).toEqual(['late', 'later', 'soon', 'fine'])
  })

  it('skips inactive plans and retired items in the query itself', async () => {
    db.maintenanceTask.findMany.mockResolvedValue([])
    await listTasks(viewer, { equipmentItemId: 'e1' })
    expect(db.maintenanceTask.findMany.mock.calls[0][0].where).toEqual({
      plan: { active: true },
      equipmentItem: { status: { not: 'retired' } },
      equipmentItemId: 'e1'
    })
  })

  it('an item past its hours is overdue even with the date still ahead', async () => {
    db.maintenanceTask.findMany.mockResolvedValue([
      task('h', '2027-01-01', { dueHours: 1000 })
    ])
    db.usageCounter.findMany.mockResolvedValue([
      { equipmentItemId: 'e-h', hours: 1010 }
    ])
    const [row] = await listTasks(viewer)
    expect(row).toMatchObject({
      state: 'overdue',
      reason: 'hours',
      hoursLeft: -10
    })
  })

  it('completing logs the work and rolls the task forward from that day', async () => {
    db.maintenanceTask.findFirst.mockResolvedValue({
      id: 't1',
      equipmentItemId: 'e1',
      plan: { title: 'Clean', intervalDays: 90, intervalHours: null },
      equipmentItem: item
    })
    db.maintenanceLog.create.mockResolvedValue({
      id: 'l1',
      equipmentItemId: 'e1',
      title: 'Clean',
      performedAt: d('2026-05-30'),
      notes: 'Done',
      costMinor: 1250,
      hoursAtService: null,
      equipmentItem: item
    })

    const log = await completeTask(engineer, 't1', {
      performedAt: '2026-05-30',
      notes: 'Done',
      costMinor: 1250
    })

    expect(log).toMatchObject({ id: 'l1', costMinor: 1250, files: [] })
    expect(db.maintenanceLog.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      equipmentItemId: 'e1',
      taskId: 't1',
      performedAt: d('2026-05-30'),
      performedById: 'user_1',
      costMinor: 1250
    })
    expect(db.maintenanceTask.updateMany).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        lastDoneAt: d('2026-05-30'),
        dueAt: d('2026-08-28'),
        dueHours: null
      }
    })
  })

  it('completing an hours task records the meter reading and restarts from it', async () => {
    db.maintenanceTask.findFirst.mockResolvedValue({
      id: 't1',
      equipmentItemId: 'e1',
      plan: { title: 'Valves', intervalDays: null, intervalHours: 500 },
      equipmentItem: item
    })
    db.maintenanceLog.create.mockResolvedValue({
      id: 'l1',
      equipmentItemId: 'e1',
      title: 'Valves',
      performedAt: d('2026-06-01'),
      notes: null,
      costMinor: null,
      hoursAtService: 1200,
      equipmentItem: item
    })
    await completeTask(owner, 't1', { hoursAtService: 1200 })
    expect(db.maintenanceTask.updateMany.mock.calls[0][0].data).toMatchObject({
      dueAt: null,
      dueHours: 1700
    })
    expect(db.usageCounter.upsert.mock.calls[0][0]).toMatchObject({
      where: { equipmentItemId: 'e1' },
      update: { hours: 1200 }
    })
  })

  it('viewers cannot complete; a foreign task is a 404; a future date is refused', async () => {
    await expectCode(completeTask(viewer, 't1', {}), 'FORBIDDEN')
    db.maintenanceTask.findFirst.mockResolvedValue(null)
    await expectCode(completeTask(owner, 'x', {}), 'NOT_FOUND')
    await expect(
      completeTask(owner, 't1', { performedAt: '2999-01-01' })
    ).rejects.toThrow()
    expect(db.maintenanceLog.create).not.toHaveBeenCalled()
  })
})

describe('usage hours', () => {
  it('is a Studio feature, needs manage rights and an item in this organisation', async () => {
    await expectCode(
      setUsageHours(free, 'e1', { hours: 5 }),
      'FEATURE_NOT_IN_PLAN'
    )
    await expectCode(setUsageHours(viewer, 'e1', { hours: 5 }), 'FORBIDDEN')
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(setUsageHours(owner, 'x', { hours: 5 }), 'NOT_FOUND')
    await expect(setUsageHours(owner, 'e1', { hours: -1 })).rejects.toThrow()
  })

  it('upserts the counter', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1', ...item })
    await expect(setUsageHours(owner, 'e1', { hours: 42.5 })).resolves.toEqual({
      hours: 42.5
    })
    expect(db.usageCounter.upsert.mock.calls[0][0]).toMatchObject({
      create: { organisationId: 'org_1', equipmentItemId: 'e1', hours: 42.5 },
      update: { hours: 42.5 }
    })
  })
})

describe('log', () => {
  const rawLog = {
    id: 'l1',
    equipmentItemId: 'e1',
    title: 'Re-valve',
    performedAt: d('2026-05-01'),
    notes: null,
    costMinor: 5000,
    hoursAtService: null,
    equipmentItem: item
  }

  it('lists entries with their files, newest first', async () => {
    db.maintenanceLog.findMany.mockResolvedValue([rawLog])
    db.attachment.findMany.mockResolvedValue([
      {
        id: 'a1',
        entityId: 'l1',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        kind: 'invoice'
      },
      {
        id: 'a2',
        entityId: 'other',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        kind: 'invoice'
      }
    ])
    const [row] = await listLog(viewer, { equipmentItemId: 'e1' })
    expect(row.files).toEqual([
      {
        id: 'a1',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        kind: 'invoice'
      }
    ])
    expect(db.maintenanceLog.findMany.mock.calls[0][0]).toMatchObject({
      where: { equipmentItemId: 'e1' },
      take: 100
    })
    expect(db.attachment.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'maintenance_log',
      entityId: { in: ['l1'] }
    })
  })

  it('records a one-off entry for an item in this organisation only', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1', ...item })
    db.maintenanceLog.create.mockResolvedValue(rawLog)
    await createLogEntry(engineer, {
      equipmentItemId: 'e1',
      title: 'Re-valve',
      costMinor: 5000
    })
    expect(db.maintenanceLog.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      equipmentItemId: 'e1',
      performedById: 'user_1'
    })
    expect(db.maintenanceLog.create.mock.calls[0][0].data).not.toHaveProperty(
      'taskId'
    )
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(
      createLogEntry(engineer, { equipmentItemId: 'x', title: 'a' }),
      'NOT_FOUND'
    )
    await expectCode(
      createLogEntry(viewer, { equipmentItemId: 'e1', title: 'a' }),
      'FORBIDDEN'
    )
  })

  it('deleting an entry removes its files first', async () => {
    db.maintenanceLog.findFirst.mockResolvedValue({
      id: 'l1',
      title: 'Re-valve',
      equipmentItemId: 'e1'
    })
    await deleteLogEntry(owner, 'l1')
    expect(deleteAttachmentsFor).toHaveBeenCalledWith(
      owner,
      'maintenance_log',
      'l1'
    )
    expect(db.maintenanceLog.deleteMany).toHaveBeenCalledWith({
      where: { id: 'l1' }
    })
    db.maintenanceLog.findFirst.mockResolvedValue(null)
    await expectCode(deleteLogEntry(owner, 'x'), 'NOT_FOUND')
  })

  it('attaches a file as an invoice owned by the entry', async () => {
    db.maintenanceLog.findFirst.mockResolvedValue({
      id: 'l1',
      title: 'Re-valve',
      equipmentItemId: 'e1'
    })
    vi.mocked(storePhoto).mockResolvedValue({ id: 'a1' } as never)
    const file = {
      name: 'i.pdf',
      type: 'application/pdf',
      data: Buffer.from('x')
    }
    await addLogFile(engineer, 'l1', file)
    expect(storePhoto).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({
        entityType: 'maintenance_log',
        entityId: 'l1',
        document: expect.objectContaining({ kind: 'invoice' })
      }),
      file
    )
    db.maintenanceLog.findFirst.mockResolvedValue(null)
    await expectCode(addLogFile(engineer, 'x', file), 'NOT_FOUND')
    await expectCode(addLogFile(viewer, 'l1', file), 'FORBIDDEN')
  })
})

describe('PAT register (Studio)', () => {
  const rawTest = (id: string, over = {}) => ({
    id,
    equipmentItemId: 'e1',
    testedAt: d('2025-06-01'),
    testType: 'combined',
    result: 'pass',
    testerName: null,
    reference: null,
    notes: null,
    intervalMonths: 12,
    nextDueAt: d('2026-06-01'),
    equipmentItem: { ...item, category: 'outboard' },
    ...over
  })

  it('is gated on the plan for every action, with a clear upgrade error', async () => {
    const input = {
      equipmentItemId: 'e1',
      testedAt: '2026-01-01',
      result: 'pass'
    }
    await expectCode(listPatStatus(free), 'FEATURE_NOT_IN_PLAN')
    await expectCode(listPatStatus(pro), 'FEATURE_NOT_IN_PLAN')
    await expectCode(createPatTest(pro, input), 'FEATURE_NOT_IN_PLAN')
    await expectCode(updatePatTest(pro, 't1', {}), 'FEATURE_NOT_IN_PLAN')
    await expectCode(deletePatTest(pro, 't1'), 'FEATURE_NOT_IN_PLAN')
    expect(db.patTest.create).not.toHaveBeenCalled()
  })

  it('viewers read the register but cannot change it', async () => {
    db.patTest.findMany.mockResolvedValue([])
    await expect(listPatStatus(viewer)).resolves.toEqual([])
    await expectCode(
      createPatTest(viewer, {
        equipmentItemId: 'e1',
        testedAt: '2026-01-01',
        result: 'pass'
      }),
      'FORBIDDEN'
    )
  })

  it('a pass schedules the next test; a fail leaves it unscheduled', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1', ...item })
    db.patTest.create.mockResolvedValue(rawTest('t1'))
    await createPatTest(engineer, {
      equipmentItemId: 'e1',
      testedAt: '2026-01-31',
      result: 'pass',
      intervalMonths: 6
    })
    expect(db.patTest.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      intervalMonths: 6,
      nextDueAt: d('2026-07-31')
    })
    await createPatTest(engineer, {
      equipmentItemId: 'e1',
      testedAt: '2026-01-31',
      result: 'fail'
    })
    expect(db.patTest.create.mock.calls[1][0].data.nextDueAt).toBeNull()
  })

  it('404s for an item in another organisation', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(
      createPatTest(owner, {
        equipmentItemId: 'x',
        testedAt: '2026-01-01',
        result: 'pass'
      }),
      'NOT_FOUND'
    )
  })

  it('status uses each item’s latest test only, most urgent first', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(d('2026-06-15'))
    db.patTest.findMany.mockResolvedValue([
      // Newest first, as queried. e1's older overdue test must be ignored.
      rawTest('new-e1', {
        testedAt: d('2026-06-01'),
        nextDueAt: d('2027-06-01')
      }),
      rawTest('old-e1', { nextDueAt: d('2026-01-01') }),
      rawTest('e2', {
        equipmentItemId: 'e2',
        nextDueAt: d('2026-06-01')
      }),
      rawTest('e3', {
        equipmentItemId: 'e3',
        result: 'fail',
        nextDueAt: null
      })
    ])
    const rows = await listPatStatus(owner)
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['e3', 'failed'],
      ['e2', 'overdue'],
      ['new-e1', 'ok']
    ])
  })

  it('editing a result recomputes the next due date', async () => {
    db.patTest.findFirst.mockResolvedValue({
      id: 't1',
      testedAt: d('2026-01-01'),
      result: 'fail',
      intervalMonths: 12,
      equipmentItem: item
    })
    await updatePatTest(owner, 't1', { result: 'pass' })
    expect(db.patTest.updateMany.mock.calls[0][0].data).toMatchObject({
      result: 'pass',
      nextDueAt: d('2027-01-01')
    })
    db.patTest.findFirst.mockResolvedValue(null)
    await expectCode(updatePatTest(owner, 'x', {}), 'NOT_FOUND')
    await expectCode(deletePatTest(owner, 'x'), 'NOT_FOUND')
  })
})

describe('warranties (free)', () => {
  const raw = {
    id: 'w1',
    equipmentItemId: 'e1',
    startsOn: d('2025-07-01'),
    endsOn: d('2026-07-01'),
    provider: 'Sound Tech',
    reference: null,
    terms: null,
    leadDays: 30,
    equipmentItem: item
  }

  it('works on the Free plan and reports status and files', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(d('2026-06-15'))
    db.warranty.findMany.mockResolvedValue([raw])
    db.attachment.findMany.mockResolvedValue([
      {
        id: 'a1',
        entityId: 'w1',
        fileName: 'r.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 5,
        kind: 'receipt'
      }
    ])
    const [row] = await listWarranties(free)
    expect(row).toMatchObject({
      state: 'expiring',
      endsOn: '2026-07-01',
      daysLeft: 16,
      files: [expect.objectContaining({ kind: 'receipt' })]
    })
  })

  it('creates for an item in this organisation only', async () => {
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1', ...item })
    db.warranty.create.mockResolvedValue(raw)
    await createWarranty(engineer, {
      equipmentItemId: 'e1',
      startsOn: '2025-07-01',
      endsOn: '2026-07-01',
      provider: 'Sound Tech'
    })
    expect(db.warranty.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      endsOn: d('2026-07-01'),
      leadDays: 30
    })
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(
      createWarranty(engineer, { equipmentItemId: 'x', endsOn: '2026-07-01' }),
      'NOT_FOUND'
    )
    await expectCode(
      createWarranty(viewer, { equipmentItemId: 'e1', endsOn: '2026-07-01' }),
      'FORBIDDEN'
    )
  })

  it('an update cannot move the end before the stored start', async () => {
    db.warranty.findFirst.mockResolvedValue(raw)
    await expect(
      updateWarranty(owner, 'w1', { endsOn: '2025-01-01' })
    ).rejects.toThrow()
    expect(db.warranty.updateMany).not.toHaveBeenCalled()
    await updateWarranty(owner, 'w1', { endsOn: '2027-07-01', provider: null })
    expect(db.warranty.updateMany.mock.calls[0][0].data).toMatchObject({
      endsOn: d('2027-07-01'),
      provider: null
    })
  })

  it('delete removes receipts too; foreign ids 404', async () => {
    db.warranty.findFirst.mockResolvedValue(raw)
    await deleteWarranty(owner, 'w1')
    expect(deleteAttachmentsFor).toHaveBeenCalledWith(owner, 'warranty', 'w1')
    expect(db.warranty.deleteMany).toHaveBeenCalledWith({ where: { id: 'w1' } })
    db.warranty.findFirst.mockResolvedValue(null)
    await expectCode(deleteWarranty(owner, 'x'), 'NOT_FOUND')
    await expectCode(updateWarranty(owner, 'x', {}), 'NOT_FOUND')
  })

  it('stores a receipt as a PDF-capable attachment owned by the warranty', async () => {
    db.warranty.findFirst.mockResolvedValue(raw)
    vi.mocked(storePhoto).mockResolvedValue({ id: 'a1' } as never)
    const file = {
      name: 'r.pdf',
      type: 'application/pdf',
      data: Buffer.from('x')
    }
    await addWarrantyFile(engineer, 'w1', file)
    expect(storePhoto).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({
        entityType: 'warranty',
        entityId: 'w1',
        document: expect.objectContaining({ kind: 'receipt' })
      }),
      file
    )
    db.warranty.findFirst.mockResolvedValue(null)
    await expectCode(addWarrantyFile(engineer, 'x', file), 'NOT_FOUND')
    await expectCode(addWarrantyFile(viewer, 'w1', file), 'FORBIDDEN')
  })
})

describe('notifications', () => {
  it('only ever reads the signed-in user’s own', async () => {
    db.notification.findMany.mockResolvedValue([
      {
        id: 'n1',
        kind: 'pat_due',
        title: 'PAT',
        body: null,
        link: '/maintenance/pat',
        readAt: null,
        createdAt: d('2026-06-01')
      }
    ])
    db.notification.count.mockResolvedValue(3)
    const rows = await listNotifications(viewer)
    expect(rows[0]).toMatchObject({ id: 'n1', read: false })
    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user_1'
    })
    expect(await countUnreadNotifications(viewer)).toBe(3)
    expect(db.notification.count.mock.calls[0][0].where).toEqual({
      userId: 'user_1',
      readAt: null
    })
  })

  it('marks only the caller’s unread notifications as read', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 2 })
    expect(await markNotificationsRead(viewer, { ids: ['a', 'b'] })).toEqual({
      updated: 2
    })
    expect(db.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'user_1',
      readAt: null,
      id: { in: ['a', 'b'] }
    })
    await markNotificationsRead(viewer, { all: true })
    expect(db.notification.updateMany.mock.calls[1][0].where).toEqual({
      userId: 'user_1',
      readAt: null
    })
    await expect(markNotificationsRead(viewer, { ids: [] })).rejects.toThrow()
  })
})
