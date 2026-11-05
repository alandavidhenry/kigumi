import { recordAudit } from '@/lib/audit'
import { describeItem, toDate } from '@/lib/equipment'
import { notFound } from '@/lib/errors'
import { Feature } from '@/lib/plans'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { patNextDue, patState } from './schedule'
import { patInputSchema, patUpdateSchema } from './schemas'

import type { PatState } from './schedule'
import type { PatResult, PatTestType } from './types'

// UK PAT testing register (PLAN §4.8). A Studio feature. Each test is a row;
// an item's status comes from its latest test, and a pass schedules the next.

export interface PatTestRow {
  id: string
  equipmentItemId: string
  itemName: string
  category: string
  testedAt: string // YYYY-MM-DD
  testType: PatTestType
  result: PatResult
  testerName: string | null
  reference: string | null
  notes: string | null
  intervalMonths: number
  nextDueAt: string | null
}

export interface PatItemStatus extends PatTestRow {
  state: PatState
  daysLeft: number | null
}

const patSelect = {
  id: true,
  equipmentItemId: true,
  testedAt: true,
  testType: true,
  result: true,
  testerName: true,
  reference: true,
  notes: true,
  intervalMonths: true,
  nextDueAt: true,
  equipmentItem: { select: { make: true, model: true, category: true } }
} as const

type RawPat = {
  id: string
  equipmentItemId: string
  testedAt: Date
  testType: string
  result: string
  testerName: string | null
  reference: string | null
  notes: string | null
  intervalMonths: number
  nextDueAt: Date | null
  equipmentItem: { make: string; model: string; category: string }
}

const day = (date: Date) => date.toISOString().slice(0, 10)

function toRow(raw: RawPat): PatTestRow {
  return {
    id: raw.id,
    equipmentItemId: raw.equipmentItemId,
    itemName: describeItem(raw.equipmentItem),
    category: raw.equipmentItem.category,
    testedAt: day(raw.testedAt),
    testType: raw.testType as PatTestType,
    result: raw.result as PatResult,
    testerName: raw.testerName,
    reference: raw.reference,
    notes: raw.notes,
    intervalMonths: raw.intervalMonths,
    nextDueAt: raw.nextDueAt ? day(raw.nextDueAt) : null
  }
}

function view(ctx: TenantContext) {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  requireFeature(ctx, Feature.PAT_TESTING)
}

function manage(ctx: TenantContext) {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  requireFeature(ctx, Feature.PAT_TESTING)
}

// The latest test per item with its live status, most urgent first.
export async function listPatStatus(
  ctx: TenantContext,
  _filter?: unknown
): Promise<PatItemStatus[]> {
  view(ctx)
  const rows = await tenantDb(ctx).patTest.findMany({
    where: { equipmentItem: { status: { not: 'retired' } } },
    orderBy: [{ testedAt: 'desc' }, { createdAt: 'desc' }],
    take: 2000,
    select: patSelect
  })
  const latest = new Map<string, RawPat>()
  for (const row of rows) {
    if (!latest.has(row.equipmentItemId)) latest.set(row.equipmentItemId, row)
  }
  const now = new Date()
  const urgency: Record<PatState, number> = {
    failed: 0,
    overdue: 1,
    due_soon: 2,
    ok: 3
  }
  return [...latest.values()]
    .map((raw): PatItemStatus => {
      const state = patState(
        {
          result: raw.result as PatResult,
          testedAt: raw.testedAt,
          nextDueAt: raw.nextDueAt
        },
        now
      )
      return {
        ...toRow(raw),
        state,
        daysLeft: raw.nextDueAt
          ? Math.ceil((raw.nextDueAt.getTime() - now.getTime()) / 86_400_000)
          : null
      }
    })
    .sort(
      (a, b) =>
        urgency[a.state] - urgency[b.state] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
        a.itemName.localeCompare(b.itemName)
    )
}

export async function listPatHistory(
  ctx: TenantContext,
  equipmentItemId: string
): Promise<PatTestRow[]> {
  view(ctx)
  const rows = await tenantDb(ctx).patTest.findMany({
    where: { equipmentItemId },
    orderBy: [{ testedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: patSelect
  })
  return rows.map(toRow)
}

export async function createPatTest(
  ctx: TenantContext,
  input: unknown
): Promise<PatTestRow> {
  manage(ctx)
  const data = patInputSchema.parse(input)
  const db = tenantDb(ctx)
  const item = await db.equipmentItem.findFirst({
    where: { id: data.equipmentItemId },
    select: { id: true, make: true, model: true }
  })
  if (!item) throw notFound('Equipment')

  const testedAt = toDate(data.testedAt)!
  const row = await db.patTest.create({
    data: {
      organisationId: ctx.organisationId,
      equipmentItemId: item.id,
      testedAt,
      testType: data.testType,
      result: data.result,
      testerName: data.testerName,
      reference: data.reference,
      notes: data.notes,
      intervalMonths: data.intervalMonths,
      nextDueAt: patNextDue(data.result, testedAt, data.intervalMonths)
    },
    select: patSelect
  })
  await recordAudit(ctx, {
    action: 'pat.create',
    entityType: 'equipment',
    entityId: item.id,
    summary: `PAT ${data.result} for ${describeItem(item)}`
  })
  return toRow(row)
}

export async function updatePatTest(
  ctx: TenantContext,
  testId: string,
  input: unknown
): Promise<void> {
  manage(ctx)
  const data = patUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const current = await db.patTest.findFirst({
    where: { id: testId },
    select: {
      id: true,
      testedAt: true,
      result: true,
      intervalMonths: true,
      equipmentItem: { select: { make: true, model: true } }
    }
  })
  if (!current) throw notFound('PAT test')

  const testedAt = data.testedAt ? toDate(data.testedAt)! : current.testedAt
  const result = (data.result ?? current.result) as PatResult
  const intervalMonths = data.intervalMonths ?? current.intervalMonths
  await db.patTest.updateMany({
    where: { id: testId },
    data: {
      ...(data.testType !== undefined && { testType: data.testType }),
      ...(data.testerName !== undefined && { testerName: data.testerName }),
      ...(data.reference !== undefined && { reference: data.reference }),
      ...(data.notes !== undefined && { notes: data.notes }),
      testedAt,
      result,
      intervalMonths,
      nextDueAt: patNextDue(result, testedAt, intervalMonths)
    }
  })
  await recordAudit(ctx, {
    action: 'pat.update',
    entityType: 'pat_test',
    entityId: testId,
    summary: `Updated PAT test for ${describeItem(current.equipmentItem)}`
  })
}

export async function deletePatTest(
  ctx: TenantContext,
  testId: string
): Promise<void> {
  manage(ctx)
  const db = tenantDb(ctx)
  const test = await db.patTest.findFirst({
    where: { id: testId },
    select: { id: true, equipmentItem: { select: { make: true, model: true } } }
  })
  if (!test) throw notFound('PAT test')
  await db.patTest.deleteMany({ where: { id: testId } })
  await recordAudit(ctx, {
    action: 'pat.delete',
    entityType: 'pat_test',
    entityId: test.id,
    summary: `Deleted PAT test for ${describeItem(test.equipmentItem)}`
  })
}
