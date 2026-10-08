import { Feature } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { toJsonValue } from '@/lib/prisma-json'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

export interface AuditEntry {
  action: string // '<entity>.<verb>', e.g. 'room.create'
  entityType: string
  entityId: string
  summary: string
  metadata?: Record<string, unknown>
}

export interface AuditLogRow {
  id: string
  action: string
  entityType: string
  entityId: string
  summary: string
  metadata: unknown
  createdAt: Date
  actor: { id: string; name: string; email: string } | null
}

// Low-level writer for callers that act on behalf of an organisation without
// a TenantContext (Better Auth organisation hooks). Prefer recordAudit.
export async function writeAuditLog(
  organisationId: string,
  actorUserId: string | null,
  entry: AuditEntry
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organisationId,
      actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      metadata: toJsonValue(entry.metadata)
    }
  })
}

export async function recordAudit(
  ctx: TenantContext,
  entry: AuditEntry
): Promise<void> {
  await tenantDb(ctx).auditLog.create({
    data: {
      organisationId: ctx.organisationId,
      actorUserId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      metadata: toJsonValue(entry.metadata)
    }
  })
}

// Reading the log needs the permission (owner/manager) and the plan feature
// (Studio+). Writing is never gated: every plan records history, so upgrading
// reveals the full trail.
export async function listAuditLog(
  ctx: TenantContext,
  { limit = 50 }: { limit?: number } = {}
): Promise<AuditLogRow[]> {
  requirePermission(ctx, Permission.VIEW_AUDIT_LOG)
  requireFeature(ctx, Feature.AUDIT_LOG)
  return tenantDb(ctx).auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } }
    }
  })
}
