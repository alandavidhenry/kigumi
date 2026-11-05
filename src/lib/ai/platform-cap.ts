import { aiUnavailable } from '@/lib/errors'
import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'

import { dailyRequestCap } from './config'

import type { AiTokenUsage } from './provider'

// Platform-wide daily spend ceiling (ADR 0014). Unlike the per-organisation
// allowance, this protects the bill itself: it counts every paid model call
// from every organisation and does not reset when the server restarts.

// 'YYYY-MM-DD' in UTC.
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

// Free organisations may use at most this share of the daily cap. Free plans
// are cheap to create, so without it a few of them could spend the whole cap
// and switch AI off for paying tenants until midnight UTC.
export const FREE_TIER_CAP_SHARE = 0.5

export function freeTierCap(cap: number): number {
  return Math.floor(cap * FREE_TIER_CAP_SHARE)
}

export interface PlatformReserveOptions {
  freeTier?: boolean
}

// Takes one request from today's platform budget or throws AI_UNAVAILABLE.
// Increment first, undo if over, so concurrent requests can't both slip under.
export async function reservePlatformRequest(
  now: Date = new Date(),
  { freeTier = false }: PlatformReserveOptions = {}
): Promise<string> {
  const day = dayKey(now)
  const cap = dailyRequestCap()
  const free = freeTier ? 1 : 0
  const row = await prisma.aiPlatformUsage.upsert({
    where: { day },
    create: { day, requests: 1, freeRequests: free },
    update: {
      requests: { increment: 1 },
      ...(freeTier && { freeRequests: { increment: 1 } })
    },
    select: { requests: true, freeRequests: true }
  })
  const overTotal = row.requests > cap
  const overFree = freeTier && row.freeRequests > freeTierCap(cap)
  if (overTotal || overFree) {
    await releasePlatformRequest(day, { freeTier })
    logger.error(
      overTotal ? 'ai.daily_cap_reached' : 'ai.daily_free_share_reached',
      { day, cap, freeCap: freeTierCap(cap) }
    )
    throw aiUnavailable(
      overTotal
        ? 'AI is paused for today because the daily usage limit has been reached. Try again tomorrow.'
        : 'AI on the Free plan is busy for today. Try again tomorrow, or upgrade for priority access.'
    )
  }
  return day
}

export async function releasePlatformRequest(
  day: string,
  { freeTier = false }: PlatformReserveOptions = {}
): Promise<void> {
  await prisma.aiPlatformUsage.updateMany({
    where: { day, requests: { gt: 0 } },
    data: { requests: { decrement: 1 } }
  })
  if (freeTier) {
    await prisma.aiPlatformUsage.updateMany({
      where: { day, freeRequests: { gt: 0 } },
      data: { freeRequests: { decrement: 1 } }
    })
  }
}

export async function recordPlatformTokens(
  day: string,
  tokens: AiTokenUsage
): Promise<void> {
  if (tokens.inputTokens === 0 && tokens.outputTokens === 0) return
  await prisma.aiPlatformUsage.updateMany({
    where: { day },
    data: {
      inputTokens: { increment: tokens.inputTokens },
      outputTokens: { increment: tokens.outputTokens }
    }
  })
}
