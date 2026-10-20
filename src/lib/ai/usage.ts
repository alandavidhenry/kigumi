import { planLimit } from '@/lib/errors'
import { getPlanLimits } from '@/lib/plans'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import type { AiTokenUsage } from './provider'

// Monthly AI allowance per organisation (PLAN §6: PLAN_LIMITS
// .aiRequestsPerMonth). One request is one user-facing generation that
// reached the provider; answers served from the cache cost nothing.

export const AI_LIMIT_RESOURCE = 'AI requests this month'

// 'YYYY-MM' in UTC, matching "times in UTC" in CLAUDE.md.
export function monthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7)
}

export interface AiUsageSummary {
  month: string
  requests: number
  limit: number
  remaining: number
  inputTokens: number
  outputTokens: number
}

export async function getAiUsage(
  ctx: TenantContext,
  now: Date = new Date()
): Promise<AiUsageSummary> {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const month = monthKey(now)
  const row = await tenantDb(ctx).aiUsage.findFirst({ where: { month } })
  const limit = getPlanLimits(ctx.planTier).aiRequestsPerMonth
  const requests = row?.requests ?? 0
  return {
    month,
    requests,
    limit,
    remaining: Math.max(0, limit - requests),
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0
  }
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: string }).code === 'P2002'

// Takes one request from this month's allowance, or throws PLAN_LIMIT. The
// increment happens first and is undone if it went over, so two concurrent
// requests cannot both slip under the limit.
export async function reserveAiRequest(
  ctx: TenantContext,
  now: Date = new Date()
): Promise<string> {
  const db = tenantDb(ctx)
  const month = monthKey(now)
  const limit = getPlanLimits(ctx.planTier).aiRequestsPerMonth

  const increment = () =>
    db.aiUsage.upsert({
      where: {
        organisationId_month: { organisationId: ctx.organisationId, month }
      },
      create: { organisationId: ctx.organisationId, month, requests: 1 },
      update: { requests: { increment: 1 } },
      select: { requests: true }
    })

  let row: { requests: number }
  try {
    row = await increment()
  } catch (error) {
    // Two first requests of the month raced to create the row.
    if (!isUniqueViolation(error)) throw error
    row = await increment()
  }

  if (row.requests > limit) {
    await db.aiUsage.updateMany({
      where: { month },
      data: { requests: { decrement: 1 } }
    })
    throw planLimit(AI_LIMIT_RESOURCE, limit)
  }
  return month
}

// Gives the request back when the user got nothing for it.
export async function releaseAiRequest(
  ctx: TenantContext,
  month: string
): Promise<void> {
  await tenantDb(ctx).aiUsage.updateMany({
    where: { month, requests: { gt: 0 } },
    data: { requests: { decrement: 1 } }
  })
}

// Tokens are recorded even when a request is released, because they were
// spent either way.
export async function recordAiTokens(
  ctx: TenantContext,
  month: string,
  tokens: AiTokenUsage
): Promise<void> {
  if (tokens.inputTokens === 0 && tokens.outputTokens === 0) return
  await tenantDb(ctx).aiUsage.updateMany({
    where: { month },
    data: {
      inputTokens: { increment: tokens.inputTokens },
      outputTokens: { increment: tokens.outputTokens }
    }
  })
}
