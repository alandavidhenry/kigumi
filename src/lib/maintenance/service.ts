import { deleteAttachmentsFor, storePhoto } from '@/lib/attachments'
import type { AttachmentRow } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import { describeItem, toDate } from '@/lib/equipment'
import type { EquipmentCategory } from '@/lib/equipment-types'
import { badRequest, notFound } from '@/lib/errors'
import { Feature } from '@/lib/plans'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import type { TenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { initialDue, nextDue, taskState } from './schedule'
import {
  completeTaskSchema,
  logFilterSchema,
  logInputSchema,
  planInputSchema,
  planUpdateSchema,
  taskFilterSchema,
  usageInputSchema
} from './schemas'
import { MAX_FILES_PER_RECORD, MAX_FILE_BYTES } from './types'

import type { DueState } from './types'

// Maintenance plans, their tasks and the completion log (PLAN §4.8, ADR 0018).
// Viewers read; engineers and above change (inventory permissions). Plans by
// time are free; plans by usage hours are a Studio feature.

export interface PlanRow {
  id: string
  title: string
  notes: string | null
  equipmentItemId: string | null
  itemName: string | null
  category: EquipmentCategory | null
  intervalDays: number | null
  intervalHours: number | null
  leadDays: number
  active: boolean
  startsOn: string | null // YYYY-MM-DD
  taskCount: number
}

export interface TaskRow {
  id: string
  planId: string
  planTitle: string
  equipmentItemId: string
  itemName: string
  category: string
  dueAt: string | null
  dueHours: number | null
  currentHours: number
  intervalDays: number | null
  intervalHours: number | null
  lastDoneAt: string | null
  state: DueState
  daysLeft: number | null
  hoursLeft: number | null
  reason: 'date' | 'hours' | null
}

export interface LogRow {
  id: string
  equipmentItemId: string
  itemName: string
  title: string
  performedAt: string
  notes: string | null
  costMinor: number | null
  hoursAtService: number | null
  files: AttachmentRow[]
}

const planSelect = {
  id: true,
  title: true,
  notes: true,
  equipmentItemId: true,
  category: true,
  intervalDays: true,
  intervalHours: true,
  leadDays: true,
  active: true,
  startsOn: true,
  createdAt: true,
  equipmentItem: { select: { make: true, model: true } },
  _count: { select: { tasks: true } }
} as const

const dateOnly = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : null

type RawPlan = {
  id: string
  title: string
  notes: string | null
  equipmentItemId: string | null
  category: string | null
  intervalDays: number | null
  intervalHours: number | null
  leadDays: number
  active: boolean
  startsOn: Date | null
  equipmentItem: { make: string; model: string } | null
  _count: { tasks: number }
}

function toPlanRow(raw: RawPlan): PlanRow {
  return {
    id: raw.id,
    title: raw.title,
    notes: raw.notes,
    equipmentItemId: raw.equipmentItemId,
    itemName: raw.equipmentItem ? describeItem(raw.equipmentItem) : null,
    category: raw.category as EquipmentCategory | null,
    intervalDays: raw.intervalDays,
    intervalHours: raw.intervalHours,
    leadDays: raw.leadDays,
    active: raw.active,
    startsOn: dateOnly(raw.startsOn),
    taskCount: raw._count.tasks
  }
}

// ---------------------------------------------------------------------------
// Usage hours

export async function loadUsageHours(
  db: TenantDb,
  itemIds: string[]
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map()
  const rows = await db.usageCounter.findMany({
    where: { equipmentItemId: { in: itemIds } },
    select: { equipmentItemId: true, hours: true }
  })
  return new Map(rows.map((row) => [row.equipmentItemId, row.hours]))
}

export async function setUsageHours(
  ctx: TenantContext,
  equipmentItemId: string,
  input: unknown
): Promise<{ hours: number }> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  requireFeature(ctx, Feature.USAGE_HOUR_MAINTENANCE)
  const { hours } = usageInputSchema.parse(input)
  const db = tenantDb(ctx)
  const item = await db.equipmentItem.findFirst({
    where: { id: equipmentItemId },
    select: { id: true, make: true, model: true }
  })
  if (!item) throw notFound('Equipment')

  await db.usageCounter.upsert({
    where: { equipmentItemId },
    create: { organisationId: ctx.organisationId, equipmentItemId, hours },
    update: { hours }
  })
  await recordAudit(ctx, {
    action: 'equipment.usage_set',
    entityType: 'equipment',
    entityId: item.id,
    summary: `Set usage of ${describeItem(item)} to ${hours} hours`
  })
  return { hours }
}

// ---------------------------------------------------------------------------
// Plans

// Makes sure every item a plan covers has a task, and that each task's due
// point matches the plan's current intervals. Retired items get no task.
export async function syncPlanTasks(
  db: TenantDb,
  organisationId: string,
  plan: {
    id: string
    equipmentItemId: string | null
    category: string | null
    intervalDays: number | null
    intervalHours: number | null
    startsOn: Date | null
    createdAt: Date
  },
  { recompute }: { recompute: boolean }
): Promise<void> {
  const items = await db.equipmentItem.findMany({
    where: {
      status: { not: 'retired' },
      ...(plan.equipmentItemId
        ? { id: plan.equipmentItemId }
        : { category: plan.category ?? '' })
    },
    select: { id: true }
  })
  const itemIds = items.map((item) => item.id)
  const [existing, hours] = await Promise.all([
    db.maintenanceTask.findMany({
      where: { planId: plan.id },
      select: { id: true, equipmentItemId: true, lastDoneAt: true }
    }),
    loadUsageHours(db, itemIds)
  ])
  const byItem = new Map(existing.map((task) => [task.equipmentItemId, task]))

  const missing = itemIds.filter((id) => !byItem.has(id))
  if (missing.length > 0) {
    await db.maintenanceTask.createMany({
      data: missing.map((equipmentItemId) => ({
        organisationId,
        planId: plan.id,
        equipmentItemId,
        ...initialDue(plan, hours.get(equipmentItemId) ?? 0)
      })),
      skipDuplicates: true
    })
  }

  if (recompute) {
    for (const task of existing) {
      const due = task.lastDoneAt
        ? nextDue(plan, task.lastDoneAt, hours.get(task.equipmentItemId) ?? 0)
        : initialDue(plan, hours.get(task.equipmentItemId) ?? 0)
      await db.maintenanceTask.updateMany({
        where: { id: task.id },
        data: due
      })
    }
  }
}

export async function listPlans(
  ctx: TenantContext,
  _filter?: unknown
): Promise<PlanRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const rows = await tenantDb(ctx).maintenancePlan.findMany({
    orderBy: { title: 'asc' },
    select: planSelect
  })
  return rows.map(toPlanRow)
}

export async function createPlan(
  ctx: TenantContext,
  input: unknown
): Promise<PlanRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = planInputSchema.parse(input)
  if (data.intervalHours !== null) {
    requireFeature(ctx, Feature.USAGE_HOUR_MAINTENANCE)
  }
  const db = tenantDb(ctx)
  if (data.equipmentItemId) {
    const item = await db.equipmentItem.findFirst({
      where: { id: data.equipmentItemId },
      select: { id: true }
    })
    if (!item) throw notFound('Equipment')
  }

  const row = await db.$transaction(async (tx) => {
    const plan = await tx.maintenancePlan.create({
      data: {
        organisationId: ctx.organisationId,
        equipmentItemId: data.equipmentItemId ?? null,
        category: data.category ?? null,
        title: data.title,
        notes: data.notes,
        intervalDays: data.intervalDays,
        intervalHours: data.intervalHours,
        leadDays: data.leadDays,
        active: data.active,
        startsOn: toDate(data.startsOn)
      },
      select: { ...planSelect }
    })
    await syncPlanTasks(tx as unknown as TenantDb, ctx.organisationId, plan, {
      recompute: false
    })
    return plan
  })
  await recordAudit(ctx, {
    action: 'maintenance_plan.create',
    entityType: 'maintenance_plan',
    entityId: row.id,
    summary: `Created maintenance plan ${row.title}`
  })
  return toPlanRow({ ...row, _count: { tasks: row._count.tasks } })
}

export async function updatePlan(
  ctx: TenantContext,
  planId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = planUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const current = await db.maintenancePlan.findFirst({
    where: { id: planId },
    select: planSelect
  })
  if (!current) throw notFound('Maintenance plan')

  const intervalDays =
    data.intervalDays !== undefined ? data.intervalDays : current.intervalDays
  const intervalHours =
    data.intervalHours !== undefined
      ? data.intervalHours
      : current.intervalHours
  if (intervalDays === null && intervalHours === null) {
    throw badRequest('Set an interval in days, in usage hours, or both')
  }
  if (intervalHours !== null && intervalHours !== current.intervalHours) {
    requireFeature(ctx, Feature.USAGE_HOUR_MAINTENANCE)
  }

  const startsOn =
    data.startsOn !== undefined ? toDate(data.startsOn) : current.startsOn
  const intervalsChanged =
    intervalDays !== current.intervalDays ||
    intervalHours !== current.intervalHours ||
    startsOn?.getTime() !== current.startsOn?.getTime()

  await db.$transaction(async (tx) => {
    await tx.maintenancePlan.updateMany({
      where: { id: planId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.leadDays !== undefined && { leadDays: data.leadDays }),
        ...(data.active !== undefined && { active: data.active }),
        intervalDays,
        intervalHours,
        startsOn
      }
    })
    await syncPlanTasks(
      tx as unknown as TenantDb,
      ctx.organisationId,
      {
        ...current,
        intervalDays,
        intervalHours,
        startsOn
      },
      { recompute: intervalsChanged }
    )
  })
  await recordAudit(ctx, {
    action: 'maintenance_plan.update',
    entityType: 'maintenance_plan',
    entityId: planId,
    summary: `Updated maintenance plan ${data.title ?? current.title}`
  })
}

export async function deletePlan(
  ctx: TenantContext,
  planId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)
  const plan = await db.maintenancePlan.findFirst({
    where: { id: planId },
    select: { id: true, title: true }
  })
  if (!plan) throw notFound('Maintenance plan')
  // Tasks go with the plan; the log keeps what was done.
  await db.maintenancePlan.deleteMany({ where: { id: planId } })
  await recordAudit(ctx, {
    action: 'maintenance_plan.delete',
    entityType: 'maintenance_plan',
    entityId: plan.id,
    summary: `Deleted maintenance plan ${plan.title}`
  })
}

// ---------------------------------------------------------------------------
// Tasks

const URGENCY: Record<DueState, number> = { overdue: 0, due_soon: 1, ok: 2 }

export async function listTasks(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<TaskRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const { scope, equipmentItemId } = taskFilterSchema.parse(filter)
  const db = tenantDb(ctx)
  const rows = await db.maintenanceTask.findMany({
    where: {
      plan: { active: true },
      equipmentItem: { status: { not: 'retired' } },
      ...(equipmentItemId && { equipmentItemId })
    },
    take: 1000,
    select: {
      id: true,
      planId: true,
      equipmentItemId: true,
      dueAt: true,
      dueHours: true,
      lastDoneAt: true,
      plan: {
        select: {
          title: true,
          intervalDays: true,
          intervalHours: true,
          leadDays: true
        }
      },
      equipmentItem: { select: { make: true, model: true, category: true } }
    }
  })
  const hours = await loadUsageHours(
    db,
    rows.map((row) => row.equipmentItemId)
  )
  const now = new Date()

  const tasks = rows.map((row): TaskRow => {
    const currentHours = hours.get(row.equipmentItemId) ?? 0
    const state = taskState(row, row.plan, currentHours, now)
    return {
      id: row.id,
      planId: row.planId,
      planTitle: row.plan.title,
      equipmentItemId: row.equipmentItemId,
      itemName: describeItem(row.equipmentItem),
      category: row.equipmentItem.category,
      dueAt: dateOnly(row.dueAt),
      dueHours: row.dueHours,
      currentHours,
      intervalDays: row.plan.intervalDays,
      intervalHours: row.plan.intervalHours,
      lastDoneAt: dateOnly(row.lastDoneAt),
      ...state
    }
  })
  return tasks
    .filter((task) => scope === 'all' || task.state !== 'ok')
    .sort(
      (a, b) =>
        URGENCY[a.state] - URGENCY[b.state] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
        a.itemName.localeCompare(b.itemName)
    )
}

export async function completeTask(
  ctx: TenantContext,
  taskId: string,
  input: unknown
): Promise<LogRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = completeTaskSchema.parse(input)
  const db = tenantDb(ctx)
  const task = await db.maintenanceTask.findFirst({
    where: { id: taskId },
    select: {
      id: true,
      equipmentItemId: true,
      plan: {
        select: { title: true, intervalDays: true, intervalHours: true }
      },
      equipmentItem: { select: { make: true, model: true } }
    }
  })
  if (!task) throw notFound('Maintenance task')

  const performedAt = data.performedAt ? toDate(data.performedAt)! : new Date()
  const hours = await loadUsageHours(db, [task.equipmentItemId])
  const hoursAtService =
    data.hoursAtService ?? hours.get(task.equipmentItemId) ?? 0

  const log = await db.$transaction(async (tx) => {
    const created = await tx.maintenanceLog.create({
      data: {
        organisationId: ctx.organisationId,
        equipmentItemId: task.equipmentItemId,
        taskId: task.id,
        title: task.plan.title,
        performedAt,
        performedById: ctx.userId,
        notes: data.notes,
        costMinor: data.costMinor,
        hoursAtService:
          task.plan.intervalHours !== null || data.hoursAtService !== null
            ? hoursAtService
            : null
      },
      select: logSelect
    })
    await tx.maintenanceTask.updateMany({
      where: { id: task.id },
      data: {
        lastDoneAt: performedAt,
        ...nextDue(task.plan, performedAt, hoursAtService)
      }
    })
    if (data.hoursAtService !== null) {
      await tx.usageCounter.upsert({
        where: { equipmentItemId: task.equipmentItemId },
        create: {
          organisationId: ctx.organisationId,
          equipmentItemId: task.equipmentItemId,
          hours: data.hoursAtService
        },
        update: { hours: data.hoursAtService }
      })
    }
    return created
  })
  await recordAudit(ctx, {
    action: 'maintenance.complete',
    entityType: 'equipment',
    entityId: task.equipmentItemId,
    summary: `Completed ${task.plan.title} on ${describeItem(task.equipmentItem)}`
  })
  return toLogRow(log, [])
}

// ---------------------------------------------------------------------------
// Log

const logSelect = {
  id: true,
  equipmentItemId: true,
  title: true,
  performedAt: true,
  notes: true,
  costMinor: true,
  hoursAtService: true,
  equipmentItem: { select: { make: true, model: true } }
} as const

type RawLog = {
  id: string
  equipmentItemId: string
  title: string
  performedAt: Date
  notes: string | null
  costMinor: number | null
  hoursAtService: number | null
  equipmentItem: { make: string; model: string }
}

function toLogRow(raw: RawLog, files: AttachmentRow[]): LogRow {
  return {
    id: raw.id,
    equipmentItemId: raw.equipmentItemId,
    itemName: describeItem(raw.equipmentItem),
    title: raw.title,
    performedAt: raw.performedAt.toISOString().slice(0, 10),
    notes: raw.notes,
    costMinor: raw.costMinor,
    hoursAtService: raw.hoursAtService,
    files
  }
}

export async function listLog(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<LogRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const { equipmentItemId, limit } = logFilterSchema.parse(filter)
  const db = tenantDb(ctx)
  const rows = await db.maintenanceLog.findMany({
    where: equipmentItemId ? { equipmentItemId } : {},
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: logSelect
  })
  const files =
    rows.length === 0
      ? []
      : await db.attachment.findMany({
          where: {
            entityType: 'maintenance_log',
            entityId: { in: rows.map((row) => row.id) }
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            entityId: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            kind: true
          }
        })
  return rows.map((row) =>
    toLogRow(
      row,
      files
        .filter((file) => file.entityId === row.id)
        .map(({ entityId: _entityId, ...file }) => file)
    )
  )
}

// A one-off entry (an unplanned repair, say) that no plan scheduled.
export async function createLogEntry(
  ctx: TenantContext,
  input: unknown
): Promise<LogRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = logInputSchema.parse(input)
  const db = tenantDb(ctx)
  const item = await db.equipmentItem.findFirst({
    where: { id: data.equipmentItemId },
    select: { id: true, make: true, model: true }
  })
  if (!item) throw notFound('Equipment')

  const log = await db.maintenanceLog.create({
    data: {
      organisationId: ctx.organisationId,
      equipmentItemId: item.id,
      title: data.title,
      performedAt: data.performedAt ? toDate(data.performedAt)! : new Date(),
      performedById: ctx.userId,
      notes: data.notes,
      costMinor: data.costMinor,
      hoursAtService: data.hoursAtService
    },
    select: logSelect
  })
  await recordAudit(ctx, {
    action: 'maintenance.log',
    entityType: 'equipment',
    entityId: item.id,
    summary: `Logged ${data.title} on ${describeItem(item)}`
  })
  return toLogRow(log, [])
}

export async function deleteLogEntry(
  ctx: TenantContext,
  logId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)
  const log = await db.maintenanceLog.findFirst({
    where: { id: logId },
    select: { id: true, title: true, equipmentItemId: true }
  })
  if (!log) throw notFound('Log entry')
  await deleteAttachmentsFor(ctx, 'maintenance_log', log.id)
  await db.maintenanceLog.deleteMany({ where: { id: logId } })
  await recordAudit(ctx, {
    action: 'maintenance.log_delete',
    entityType: 'equipment',
    entityId: log.equipmentItemId,
    summary: `Deleted log entry ${log.title}`
  })
}

export async function addLogFile(
  ctx: TenantContext,
  logId: string,
  file: { name: string; type: string; data: Buffer }
): Promise<AttachmentRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const log = await tenantDb(ctx).maintenanceLog.findFirst({
    where: { id: logId },
    select: { id: true, title: true, equipmentItemId: true }
  })
  if (!log) throw notFound('Log entry')
  const row = await storePhoto(
    ctx,
    {
      entityType: 'maintenance_log',
      entityId: log.id,
      maxPhotos: MAX_FILES_PER_RECORD,
      document: { kind: 'invoice', maxBytes: MAX_FILE_BYTES }
    },
    file
  )
  await recordAudit(ctx, {
    action: 'maintenance.file_add',
    entityType: 'equipment',
    entityId: log.equipmentItemId,
    summary: `Attached a file to ${log.title}`
  })
  return row
}
