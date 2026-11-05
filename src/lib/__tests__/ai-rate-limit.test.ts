import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  aiRateLimiter,
  createDbRateLimiter,
  createRateLimiter,
  pruneAiRateWindows,
  setAiRateLimiter
} from '@/lib/ai/rate-limit'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: {
    aiRateWindow: {
      upsert: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}))

const windows = vi.mocked(prisma.aiRateWindow)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createDbRateLimiter', () => {
  const limiter = createDbRateLimiter({
    max: 2,
    windowMs: 60_000,
    now: () => 125_000 // 5 s into the window that starts at 120 s
  })

  it('counts each request in the current window with one atomic upsert', async () => {
    windows.upsert.mockResolvedValue({ count: 1 } as never)
    expect(await limiter.consume('org_1')).toBe(0)
    expect(windows.upsert).toHaveBeenCalledWith({
      where: { id: 'org_1:120000' },
      create: {
        id: 'org_1:120000',
        count: 1,
        expiresAt: new Date(180_000)
      },
      update: { count: { increment: 1 } },
      select: { count: true }
    })
  })

  it('allows up to max and then says how long until the window ends', async () => {
    windows.upsert.mockResolvedValue({ count: 2 } as never)
    expect(await limiter.consume('org_1')).toBe(0)
    windows.upsert.mockResolvedValue({ count: 3 } as never)
    expect(await limiter.consume('org_1')).toBe(55)
  })

  it('keeps a separate window per organisation', async () => {
    windows.upsert.mockResolvedValue({ count: 1 } as never)
    await limiter.consume('org_2')
    expect(windows.upsert.mock.calls[0][0].where).toEqual({
      id: 'org_2:120000'
    })
  })
})

describe('pruneAiRateWindows', () => {
  it('deletes only finished windows', async () => {
    windows.deleteMany.mockResolvedValue({ count: 4 } as never)
    const now = new Date('2026-11-05T10:00:00Z')
    expect(await pruneAiRateWindows(now)).toBe(4)
    expect(windows.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } }
    })
  })
})

describe('aiRateLimiter', () => {
  it('delegates to whichever limiter is set', async () => {
    setAiRateLimiter(createRateLimiter({ max: 1, windowMs: 1000 }))
    expect(await aiRateLimiter.consume('a')).toBe(0)
    expect(await aiRateLimiter.consume('a')).toBeGreaterThan(0)
    expect(windows.upsert).not.toHaveBeenCalled()
  })
})
