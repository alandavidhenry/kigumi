import { AI_RATE_LIMIT } from './config'

// Sliding-window limiter, one window per key (the organisation id). In
// memory, so it is per server instance; the monthly allowance in AiUsage is
// the durable limit. See future-considerations.md.

export interface RateLimiter {
  // Returns 0 when allowed (and records the hit), otherwise the seconds to
  // wait before the oldest hit leaves the window.
  consume(key: string): number
  reset(): void
}

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

export const aiRateLimiter = createRateLimiter(AI_RATE_LIMIT)
