import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { notificationReadSchema } from './schemas'

import type { NotificationKind } from './types'

// In-app reminders. Everyone sees only their own, in the active organisation.

export interface NotificationRow {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

export async function listNotifications(
  ctx: TenantContext,
  { limit = 50 }: { limit?: number } = {}
): Promise<NotificationRow[]> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const rows = await tenantDb(ctx).notification.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true
    }
  })
  return rows.map(({ readAt, createdAt, kind, ...row }) => ({
    ...row,
    kind: kind as NotificationKind,
    read: readAt !== null,
    createdAt: createdAt.toISOString()
  }))
}

export async function countUnreadNotifications(
  ctx: TenantContext
): Promise<number> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  return tenantDb(ctx).notification.count({
    where: { userId: ctx.userId, readAt: null }
  })
}

export async function markNotificationsRead(
  ctx: TenantContext,
  input: unknown
): Promise<{ updated: number }> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const parsed = notificationReadSchema.parse(input)
  const result = await tenantDb(ctx).notification.updateMany({
    where: {
      userId: ctx.userId,
      readAt: null,
      ...('ids' in parsed && { id: { in: parsed.ids } })
    },
    data: { readAt: new Date() }
  })
  return { updated: result.count }
}
