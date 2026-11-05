import { hasFeature, Feature } from '@/lib/plans'
import { listSessions } from '@/lib/sessions/service'
import type { SessionSummary } from '@/lib/sessions/service'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission, hasPermission } from '@/types/rbac'

import { countUnreadNotifications } from './notifications'
import { listPatStatus } from './pat'
import { listLog, listTasks, loadUsageHours } from './service'
import { listWarranties } from './warranty'

import type { PatItemStatus } from './pat'
import type { LogRow, TaskRow } from './service'
import type { WarrantyRow } from './warranty'

// What needs attention, for the dashboard and for an item's page (PLAN §4.10).
// Each part is only loaded for a role and plan that may see it.

export interface DashboardCare {
  sessions: SessionSummary[] | null
  tasks: TaskRow[] | null
  overdueTasks: number
  pat: PatItemStatus[] | null
  warranties: WarrantyRow[] | null
  unreadNotifications: number
}

const LIST_LIMIT = 6

export async function loadDashboardCare(
  ctx: TenantContext
): Promise<DashboardCare> {
  const canInventory = hasPermission(ctx.role, Permission.VIEW_INVENTORY)
  const canSessions = hasPermission(ctx.role, Permission.VIEW_SESSIONS)
  const canPat = canInventory && hasFeature(ctx.planTier, Feature.PAT_TESTING)

  const [sessions, tasks, pat, warranties, unreadNotifications] =
    await Promise.all([
      canSessions ? listSessions(ctx, { scope: 'upcoming' }) : null,
      canInventory ? listTasks(ctx, { scope: 'attention' }) : null,
      canPat ? listPatStatus(ctx) : null,
      canInventory ? listWarranties(ctx) : null,
      countUnreadNotifications(ctx)
    ])

  return {
    sessions: sessions && sessions.slice(0, LIST_LIMIT),
    tasks: tasks && tasks.slice(0, LIST_LIMIT),
    overdueTasks: tasks?.filter((task) => task.state === 'overdue').length ?? 0,
    pat: pat && pat.filter((test) => test.state !== 'ok').slice(0, LIST_LIMIT),
    warranties:
      warranties &&
      warranties.filter((w) => w.state === 'expiring').slice(0, LIST_LIMIT),
    unreadNotifications
  }
}

export interface ItemCare {
  usageHours: number
  tasks: TaskRow[]
  pat: PatItemStatus | null
  warranties: WarrantyRow[]
  log: LogRow[]
}

export async function loadItemCare(
  ctx: TenantContext,
  equipmentItemId: string
): Promise<ItemCare> {
  const db = tenantDb(ctx)
  const canPat = hasFeature(ctx.planTier, Feature.PAT_TESTING)
  const [hours, tasks, warranties, log, pat] = await Promise.all([
    loadUsageHours(db, [equipmentItemId]),
    listTasks(ctx, { scope: 'all', equipmentItemId }),
    listWarranties(ctx, { equipmentItemId }),
    listLog(ctx, { equipmentItemId, limit: 10 }),
    canPat ? listPatStatus(ctx) : Promise.resolve([])
  ])
  return {
    usageHours: hours.get(equipmentItemId) ?? 0,
    tasks,
    pat: pat.find((test) => test.equipmentItemId === equipmentItemId) ?? null,
    warranties,
    log
  }
}
