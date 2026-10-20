import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAiUsage,
  recordAiTokens,
  releaseAiRequest,
  reserveAiRequest
} from '@/lib/ai/usage'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: {} }))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: never }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

let db: FakeDb
const now = new Date('2026-10-15T12:00:00Z')
const free = makeContext({ planTier: PlanTier.FREE })

beforeEach(() => {
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
})

describe('getAiUsage', () => {
  it('reports this month against the plan allowance', async () => {
    db.aiUsage.findFirst.mockResolvedValue({
      requests: 7,
      inputTokens: 1000,
      outputTokens: 400
    })
    expect(await getAiUsage(free, now)).toEqual({
      month: '2026-10',
      requests: 7,
      limit: 25,
      remaining: 18,
      inputTokens: 1000,
      outputTokens: 400
    })
    expect(db.aiUsage.findFirst).toHaveBeenCalledWith({
      where: { month: '2026-10' }
    })
  })

  it('reports zero before the first request of the month', async () => {
    db.aiUsage.findFirst.mockResolvedValue(null)
    const usage = await getAiUsage(free, now)
    expect(usage.requests).toBe(0)
    expect(usage.remaining).toBe(25)
  })

  it('never reports a negative remainder', async () => {
    db.aiUsage.findFirst.mockResolvedValue({ requests: 30 })
    expect((await getAiUsage(free, now)).remaining).toBe(0)
  })

  it('uses the limit of the organisation plan', async () => {
    db.aiUsage.findFirst.mockResolvedValue(null)
    const usage = await getAiUsage(makeContext({ planTier: PlanTier.PRO }), now)
    expect(usage.limit).toBe(400)
  })
})

describe('reserveAiRequest', () => {
  it('increments this month and returns the month key', async () => {
    db.aiUsage.upsert.mockResolvedValue({ requests: 1 })
    expect(await reserveAiRequest(free, now)).toBe('2026-10')
    const call = db.aiUsage.upsert.mock.calls[0][0]
    expect(call.create).toEqual({
      organisationId: 'org_1',
      month: '2026-10',
      requests: 1
    })
    expect(call.update).toEqual({ requests: { increment: 1 } })
    expect(call.where.organisationId_month).toEqual({
      organisationId: 'org_1',
      month: '2026-10'
    })
  })

  it('allows the last request of the allowance', async () => {
    db.aiUsage.upsert.mockResolvedValue({ requests: 25 })
    await expect(reserveAiRequest(free, now)).resolves.toBe('2026-10')
    expect(db.aiUsage.updateMany).not.toHaveBeenCalled()
  })

  it('refuses over the allowance and gives the increment back', async () => {
    db.aiUsage.upsert.mockResolvedValue({ requests: 26 })
    const error = await reserveAiRequest(free, now).catch((e) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('PLAN_LIMIT')
    expect(error.message).toBe(
      'Your plan allows 25 AI requests this month. Upgrade to add more.'
    )
    expect(db.aiUsage.updateMany).toHaveBeenCalledWith({
      where: { month: '2026-10' },
      data: { requests: { decrement: 1 } }
    })
  })

  it('retries once when two first requests race to create the row', async () => {
    db.aiUsage.upsert
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ requests: 2 })
    await expect(reserveAiRequest(free, now)).resolves.toBe('2026-10')
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(2)
  })

  it('does not swallow other database errors', async () => {
    db.aiUsage.upsert.mockRejectedValue(new Error('db down'))
    await expect(reserveAiRequest(free, now)).rejects.toThrow('db down')
  })
})

describe('releaseAiRequest / recordAiTokens', () => {
  it('releases one request, never below zero', async () => {
    await releaseAiRequest(free, '2026-10')
    expect(db.aiUsage.updateMany).toHaveBeenCalledWith({
      where: { month: '2026-10', requests: { gt: 0 } },
      data: { requests: { decrement: 1 } }
    })
  })

  it('adds token counts to the month', async () => {
    await recordAiTokens(free, '2026-10', { inputTokens: 5, outputTokens: 3 })
    expect(db.aiUsage.updateMany).toHaveBeenCalledWith({
      where: { month: '2026-10' },
      data: {
        inputTokens: { increment: 5 },
        outputTokens: { increment: 3 }
      }
    })
  })

  it('skips the write when nothing was spent', async () => {
    await recordAiTokens(free, '2026-10', { inputTokens: 0, outputTokens: 0 })
    expect(db.aiUsage.updateMany).not.toHaveBeenCalled()
  })
})

describe('tenant scoping', () => {
  it('always goes through tenantDb for the caller organisation', async () => {
    db.aiUsage.findFirst.mockResolvedValue(null)
    await getAiUsage(makeContext({ organisationId: 'org_other' }), now)
    expect(tenantDb).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: 'org_other' })
    )
  })

  it('lets any role see usage', async () => {
    db.aiUsage.findFirst.mockResolvedValue(null)
    await expect(
      getAiUsage(makeContext({ role: MemberRole.VIEWER }), now)
    ).resolves.toBeDefined()
  })
})
