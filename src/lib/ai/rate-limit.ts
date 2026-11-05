import { AI_RATE_LIMIT } from './config'

// Per-organisation AI burst limit (ADR 0013). The monthly allowance in AiUsage
// is the durable limit; this stops one organisation firing many requests in a
// minute. The production limiter keeps its counts in Postgres so the limit
// holds across instances and restarts; the in-memory one is for unit tests.

export interface RateLimiter {
  // Returns 0 when allowed (and records the hit), otherwise the seconds to
  // wait before trying again.
  consume(key: string): number | Promise<number>
  reset(): void | Promise<void>
}

// Sliding window in memory, one window per key.
export function createRateLimiter({
  max,
  windowMs,
  now = Date.now
}: {
  max: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    consume(key) {
      const current = now()
      const recent = (hits.get(key) ?? []).filter(
        (at) => current - at < windowMs
      )
      if (recent.length >= max) {
        hits.set(key, recent)
        return Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1000))
      }
      recent.push(current)
      hits.set(key, recent)
      return 0
    },
    reset() {
      hits.clear()
    }
  }
}

// Fixed windows in Postgres (AiRateWindow): one atomic upsert per request. A
// fixed window can let up to 2 x max through across a boundary, which is fine
// for a burst guard; the allowance and the platform cap are exact.
export function createDbRateLimiter({
  max,
  windowMs,
  now = Date.now
}: {
  max: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  // Imported lazily so modules that only need the in-memory limiter (tests)
  // never construct a database client.
  const db = async () => (await import('@/lib/prisma')).default
  return {
    async consume(key) {
      const current = now()
      const windowStart = Math.floor(current / windowMs) * windowMs
      const id = `${key}:${windowStart}`
      const row = await (
        await db()
      ).aiRateWindow.upsert({
        where: { id },
        create: { id, count: 1, expiresAt: new Date(windowStart + windowMs) },
        update: { count: { increment: 1 } },
        select: { count: true }
      })
      if (row.count <= max) return 0
      return Math.max(1, Math.ceil((windowStart + windowMs - current) / 1000))
    },
    async reset() {
      await (await db()).aiRateWindow.deleteMany({})
    }
  }
}

// Deletes finished windows; run by the housekeeping job.
export async function pruneAiRateWindows(now = new Date()): Promise<number> {
  const prisma = (await import('@/lib/prisma')).default
  const { count } = await prisma.aiRateWindow.deleteMany({
    where: { expiresAt: { lt: now } }
  })
  return count
}

let current: RateLimiter = createDbRateLimiter(AI_RATE_LIMIT)

// The limiter the AI service uses. Tests swap in an in-memory one.
export const aiRateLimiter: RateLimiter = {
  consume: (key) => current.consume(key),
  reset: () => current.reset()
}

export function setAiRateLimiter(limiter: RateLimiter): void {
  current = limiter
}
