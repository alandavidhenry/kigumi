import { randomBytes } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import { notFound } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { hashToken, sealToken } from '@/lib/secret-box'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { loadSessionOverview } from './overview'
import { shareInputSchema } from './schemas'
import { buildSheetView } from './sheet'

import type { ShareInfo } from './service'
import type { SharedSessionView } from './sheet'

export type { SharedSessionView } from './sheet'

// Read-only share links (PLAN §4.6, ADR 0016 decision 7).
//
// The token IS the authorisation, so resolving one is the single place that
// reads without a TenantContext (a documented exception to ADR 0003). It looks
// the link up with the raw client, then reads everything through a client
// scoped to the link's own organisation, and returns a deliberate projection:
// nothing in SharedSessionView carries an id, serial, note or client name.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

// The sealing purpose for share tokens (src/lib/secret-box.ts).
export const SHARE_TOKEN_PURPOSE = 'session-share-link'

async function assertSession(ctx: TenantContext, sessionId: string) {
  const session = await tenantDb(ctx).recordingSession.findFirst({
    where: { id: sessionId },
    select: { name: true }
  })
  if (!session) throw notFound('Session')
  return session
}

// One live link per session: making a new one revokes the old.
export async function createShareLink(
  ctx: TenantContext,
  sessionId: string,
  input: unknown = {}
): Promise<ShareInfo> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const { expiresInDays } = shareInputSchema.parse(input)
  const session = await assertSession(ctx, sessionId)
  const db = tenantDb(ctx)

  const now = new Date()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = expiresInDays
    ? new Date(now.getTime() + expiresInDays * 86_400_000)
    : null
  await db.$transaction(async (tx) => {
    await tx.sessionShareLink.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now }
    })
    await tx.sessionShareLink.create({
      data: {
        organisationId: ctx.organisationId,
        sessionId,
        tokenHash: hashToken(token),
        tokenSealed: sealToken(token, SHARE_TOKEN_PURPOSE),
        expiresAt,
        createdById: ctx.userId
      }
    })
  })
  await recordAudit(ctx, {
    action: 'session.share',
    entityType: 'session',
    entityId: sessionId,
    summary: `Created a share link for ${session.name}`,
    metadata: { expiresInDays: expiresInDays ?? null }
  })
  return { token, expiresAt: expiresAt ? expiresAt.toISOString() : null }
}

export async function revokeShareLink(
  ctx: TenantContext,
  sessionId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const session = await assertSession(ctx, sessionId)
  const { count } = await tenantDb(ctx).sessionShareLink.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date() }
  })
  if (count === 0) throw notFound('Share link')
  await recordAudit(ctx, {
    action: 'session.unshare',
    entityType: 'session',
    entityId: sessionId,
    summary: `Revoked the share link for ${session.name}`
  })
}

export async function getSharedSession(
  token: string
): Promise<SharedSessionView> {
  // Unknown, malformed, revoked and expired all look the same.
  const missing = () => notFound('Shared session')
  if (!TOKEN_PATTERN.test(token)) throw missing()

  const link = await prisma.sessionShareLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      organisationId: true,
      sessionId: true,
      expiresAt: true,
      revokedAt: true
    }
  })
  if (!link || link.revokedAt) throw missing()
  if (link.expiresAt && link.expiresAt <= new Date()) throw missing()

  const db = tenantDb({ organisationId: link.organisationId })
  const overview = await loadSessionOverview(db, link.sessionId)
  if (!overview) throw missing()
  const organisation = await prisma.organization.findFirst({
    where: { id: link.organisationId },
    select: { name: true, planTier: true }
  })
  if (!organisation) throw missing()

  // Best effort: a failure to record the view must not break the page.
  await prisma.sessionShareLink
    .update({ where: { id: link.id }, data: { lastViewedAt: new Date() } })
    .catch(() => undefined)

  return buildSheetView(overview, organisation, false)
}
