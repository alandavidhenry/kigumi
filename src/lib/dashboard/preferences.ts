import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { savedLayoutSchema, type SavedLayout } from './tiles'

// One person's dashboard arrangement in this organisation (ADR 0025). Anyone
// who can see the dashboard may arrange their own; it never affects others.

export async function getDashboardLayout(
  ctx: TenantContext
): Promise<SavedLayout | null> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const row = await tenantDb(ctx).dashboardPreference.findFirst({
    where: { userId: ctx.userId },
    select: { layout: true }
  })
  const parsed = savedLayoutSchema.safeParse(row?.layout)
  return parsed.success ? parsed.data : null
}

export async function saveDashboardLayout(
  ctx: TenantContext,
  input: unknown
): Promise<SavedLayout> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const layout = savedLayoutSchema.parse(input)
  const db = tenantDb(ctx)
  const existing = await db.dashboardPreference.findFirst({
    where: { userId: ctx.userId },
    select: { id: true }
  })
  if (existing) {
    await db.dashboardPreference.updateMany({
      where: { id: existing.id, userId: ctx.userId },
      data: { layout }
    })
  } else {
    await db.dashboardPreference.create({
      data: {
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        layout
      }
    })
  }
  return layout
}

// Back to the default arrangement.
export async function resetDashboardLayout(ctx: TenantContext): Promise<void> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  await tenantDb(ctx).dashboardPreference.deleteMany({
    where: { userId: ctx.userId }
  })
}
