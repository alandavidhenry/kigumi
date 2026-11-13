import { recordAudit } from '@/lib/audit'
import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission, hasPermission } from '@/types/rbac'

// How far an organisation is through getting started (PLAN: setup wizard and
// dashboard checklist). Computed from real data, so it can't drift.

export interface SetupProgress {
  studios: number
  rooms: number
  micUnits: number
  consoles: number
  sessions: number
  steps: {
    studio: boolean
    rooms: boolean
    mics: boolean
    desk: boolean
    session: boolean
  }
  complete: boolean
}

export async function getSetupProgress(
  ctx: TenantContext
): Promise<SetupProgress> {
  // Every member sees the dashboard counts, so the lowest common permission.
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const db = tenantDb(ctx)
  const [studios, rooms, micUnits, consoles, sessions] = await Promise.all([
    db.studio.count(),
    db.room.count(),
    db.microphoneUnit.count(),
    db.console.count(),
    db.recordingSession.count()
  ])
  const steps = {
    studio: studios > 0,
    rooms: rooms > 0,
    mics: micUnits > 0,
    desk: consoles > 0,
    session: sessions > 0
  }
  return {
    studios,
    rooms,
    micUnits,
    consoles,
    sessions,
    steps,
    complete: Object.values(steps).every(Boolean)
  }
}

// First-run setup is forced on owners and managers until the organisation has
// finished or skipped it (ADR 0025). Everyone else is never sent to /setup.
export async function isSetupRequired(ctx: TenantContext): Promise<boolean> {
  if (!hasPermission(ctx.role, Permission.MANAGE_STUDIOS)) return false
  const organisation = await prisma.organization.findUnique({
    where: { id: ctx.organisationId },
    select: { setupResolvedAt: true }
  })
  return organisation !== null && organisation.setupResolvedAt === null
}

// Marks setup as finished or skipped. Idempotent: the first time wins, so
// running the wizard again later does not move the date.
export async function resolveSetup(
  ctx: TenantContext,
  outcome: 'finished' | 'skipped'
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const { count } = await prisma.organization.updateMany({
    where: { id: ctx.organisationId, setupResolvedAt: null },
    data: { setupResolvedAt: new Date() }
  })
  if (count === 0) return
  await recordAudit(ctx, {
    action: 'setup.resolve',
    entityType: 'organisation',
    entityId: ctx.organisationId,
    summary: `Setup ${outcome}`,
    metadata: { outcome }
  })
}
