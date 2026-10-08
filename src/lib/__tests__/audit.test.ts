import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAuditLog, recordAudit, writeAuditLog } from '@/lib/audit'
import { PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/prisma', () => ({
  default: { auditLog: { create: vi.fn() } }
}))
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

let db: FakeDb
const ctx = makeContext()
const entry = {
  action: 'room.create',
  entityType: 'room',
  entityId: 'r1',
  summary: 'Created room Live'
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
})

describe('recordAudit', () => {
  it('writes through the tenant-scoped client with the actor', async () => {
    await recordAudit(ctx, { ...entry, metadata: { fields: ['name'] } })
    expect(tenantDb).toHaveBeenCalledWith(ctx)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        organisationId: 'org_1',
        actorUserId: 'user_1',
        ...entry,
        metadata: { fields: ['name'] }
      }
    })
  })

  it('leaves metadata untouched when absent', async () => {
    await recordAudit(ctx, entry)
    expect(db.auditLog.create.mock.calls[0][0].data.metadata).toBeUndefined()
  })
})

describe('writeAuditLog', () => {
  it('writes for an organisation without a context', async () => {
    await writeAuditLog('org_9', null, entry)
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organisationId: 'org_9',
        actorUserId: null,
        ...entry,
        metadata: undefined
      }
    })
  })
})

describe('listAuditLog', () => {
  it('returns newest first with a default limit', async () => {
    db.auditLog.findMany.mockResolvedValue([])
    await listAuditLog(ctx)
    expect(db.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50 })
    )
  })

  it('clamps the limit', async () => {
    db.auditLog.findMany.mockResolvedValue([])
    await listAuditLog(ctx, { limit: 10_000 })
    expect(db.auditLog.findMany.mock.calls[0][0].take).toBe(200)
    await listAuditLog(ctx, { limit: -3 })
    expect(db.auditLog.findMany.mock.calls[1][0].take).toBe(1)
  })

  it('is forbidden for engineers and viewers', async () => {
    await expect(
      listAuditLog(makeContext({ role: MemberRole.ENGINEER }))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it.each([PlanTier.FREE, PlanTier.PRO])(
    'needs the Studio plan or above (%s is refused)',
    async (planTier) => {
      await expect(
        listAuditLog(makeContext({ planTier }))
      ).rejects.toMatchObject({
        code: 'FEATURE_NOT_IN_PLAN',
        status: 403,
        details: { feature: 'Activity log', requiredPlan: 'Studio' }
      })
      expect(db.auditLog.findMany).not.toHaveBeenCalled()
    }
  )

  it('is available on Facility', async () => {
    db.auditLog.findMany.mockResolvedValue([])
    await listAuditLog(makeContext({ planTier: PlanTier.FACILITY }))
    expect(db.auditLog.findMany).toHaveBeenCalled()
  })
})
