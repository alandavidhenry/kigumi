import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as auditLogRoute } from '@/app/api/audit-log/route'
import { GET as deepHealth } from '@/app/api/health/deep/route'
import { GET as health } from '@/app/api/health/route'
import { listAuditLog } from '@/lib/audit'
import { checkDatabase, checkStorage } from '@/lib/health'
import { getTenantContext } from '@/lib/tenant-context'
import { makeContext } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/audit', () => ({ listAuditLog: vi.fn() }))
vi.mock('@/lib/health', () => ({
  checkDatabase: vi.fn(),
  checkStorage: vi.fn()
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('is a dependency-free liveness check', async () => {
    const response = await health()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(checkDatabase).not.toHaveBeenCalled()
  })
})

describe('GET /api/health/deep', () => {
  it('is 200 when the database and storage are up', async () => {
    vi.mocked(checkDatabase).mockResolvedValue(true)
    vi.mocked(checkStorage).mockResolvedValue(true)
    const response = await deepHealth()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { db: 'ok', storage: 'ok' }
    })
  })

  it('is 503 when a dependency is down', async () => {
    vi.mocked(checkDatabase).mockResolvedValue(false)
    vi.mocked(checkStorage).mockResolvedValue(true)
    const response = await deepHealth()
    expect(response.status).toBe(503)
    expect((await response.json()).checks.db).toBe('error')
  })
})

describe('GET /api/audit-log', () => {
  it('returns entries for managers', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(
      makeContext({ role: MemberRole.MANAGER })
    )
    vi.mocked(listAuditLog).mockResolvedValue([])
    const response = await auditLogRoute(
      new Request('http://x/api/audit-log?limit=10')
    )
    expect(response.status).toBe(200)
    expect(listAuditLog).toHaveBeenCalledWith(expect.anything(), { limit: 10 })
  })

  it('falls back to the default limit on junk input', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(makeContext())
    vi.mocked(listAuditLog).mockResolvedValue([])
    await auditLogRoute(new Request('http://x/api/audit-log?limit=lots'))
    expect(listAuditLog).toHaveBeenCalledWith(expect.anything(), { limit: 50 })
  })

  it('403s for engineers', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(
      makeContext({ role: MemberRole.ENGINEER })
    )
    const response = await auditLogRoute(new Request('http://x/api/audit-log'))
    expect(response.status).toBe(403)
    expect(listAuditLog).not.toHaveBeenCalled()
  })
})
