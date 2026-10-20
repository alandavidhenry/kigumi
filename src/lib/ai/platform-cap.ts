import { aiUnavailable } from '@/lib/errors'
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

// Takes one request from today's platform budget or throws AI_UNAVAILABLE.
// Increment first, undo if over, so concurrent requests can't both slip under.
export async function reservePlatformRequest(
  now: Date = new Date()
): Promise<string> {
  const day = dayKey(now)
  const cap = dailyRequestCap()
  const row = await prisma.aiPlatformUsage.upsert({
    where: { day },
    create: { day, requests: 1 },
    update: { requests: { increment: 1 } },
    select: { requests: true }
  })
  if (row.requests > cap) {
    await releasePlatformRequest(day)
    console.error(`AI daily request cap reached (${cap}) for ${day}`)
    throw aiUnavailable(
      'AI is paused for today because the daily usage limit has been reached. Try again tomorrow.'
    )
  }
  return day
}

export async function releasePlatformRequest(day: string): Promise<void> {
  await prisma.aiPlatformUsage.updateMany({
    where: { day, requests: { gt: 0 } },
    data: { requests: { decrement: 1 } }
  })
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
