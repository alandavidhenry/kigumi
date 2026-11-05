import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadDashboardCare, loadItemCare } from '@/lib/maintenance/overview'
import { PlanTier } from '@/lib/plans'
import { makeContext } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn(() => ({})) }))
vi.mock('@/lib/sessions/service', () => ({ listSessions: vi.fn() }))
vi.mock('@/lib/maintenance/notifications', () => ({
  countUnreadNotifications: vi.fn()
}))
vi.mock('@/lib/maintenance/pat', () => ({ listPatStatus: vi.fn() }))
vi.mock('@/lib/maintenance/warranty', () => ({ listWarranties: vi.fn() }))
vi.mock('@/lib/maintenance/service', () => ({
  listTasks: vi.fn(),
  listLog: vi.fn(),
  loadUsageHours: vi.fn()
}))

const { listSessions } = vi.mocked(await import('@/lib/sessions/service'))
const { countUnreadNotifications } = vi.mocked(
  await import('@/lib/maintenance/notifications')
)
const { listPatStatus } = vi.mocked(await import('@/lib/maintenance/pat'))
const { listWarranties } = vi.mocked(await import('@/lib/maintenance/warranty'))
const { listTasks, listLog, loadUsageHours } = vi.mocked(
  await import('@/lib/maintenance/service')
)

const task = (id: string, state: string) => ({ id, state }) as never
const warranty = (id: string, state: string) => ({ id, state }) as never

beforeEach(() => {
  vi.clearAllMocks()
  listSessions.mockResolvedValue([])
  countUnreadNotifications.mockResolvedValue(2)
  listPatStatus.mockResolvedValue([])
  listWarranties.mockResolvedValue([])
  listTasks.mockResolvedValue([])
  listLog.mockResolvedValue([])
  loadUsageHours.mockResolvedValue(new Map())
})

describe('loadDashboardCare', () => {
  it('summarises tasks, counting overdue ones before trimming the list', async () => {
    listTasks.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => task(`t${i}`, 'overdue'))
    )
    const care = await loadDashboardCare(makeContext())
    expect(care.tasks).toHaveLength(6)
    expect(care.overdueTasks).toBe(9)
    expect(care.unreadNotifications).toBe(2)
    expect(listTasks).toHaveBeenCalledWith(expect.anything(), {
      scope: 'attention'
    })
  })

  it('only shows warranties that are expiring, and PAT items that need action', async () => {
    listWarranties.mockResolvedValue([
      warranty('a', 'active'),
      warranty('b', 'expiring'),
      warranty('c', 'expired')
    ])
    listPatStatus.mockResolvedValue([
      { id: 'ok', state: 'ok' },
      { id: 'late', state: 'overdue' }
    ] as never)
    const care = await loadDashboardCare(makeContext())
    expect(care.warranties?.map((w) => w.id)).toEqual(['b'])
    expect(care.pat?.map((p) => p.id)).toEqual(['late'])
  })

  it('does not load the PAT register below the Studio plan', async () => {
    const care = await loadDashboardCare(
      makeContext({ planTier: PlanTier.PRO })
    )
    expect(listPatStatus).not.toHaveBeenCalled()
    expect(care.pat).toBeNull()
    expect(care.tasks).not.toBeNull()
  })

  it('every role that can read the app can load its own dashboard', async () => {
    for (const role of Object.values(MemberRole)) {
      await expect(
        loadDashboardCare(makeContext({ role }))
      ).resolves.toMatchObject({ unreadNotifications: 2 })
    }
  })
})

describe('loadItemCare', () => {
  it('asks for just this item across tasks, warranties and the log', async () => {
    loadUsageHours.mockResolvedValue(new Map([['e1', 75]]))
    listPatStatus.mockResolvedValue([
      { equipmentItemId: 'other' },
      { equipmentItemId: 'e1', id: 'mine' }
    ] as never)
    const care = await loadItemCare(makeContext(), 'e1')

    expect(care.usageHours).toBe(75)
    expect(care.pat).toMatchObject({ id: 'mine' })
    expect(listTasks).toHaveBeenCalledWith(expect.anything(), {
      scope: 'all',
      equipmentItemId: 'e1'
    })
    expect(listWarranties).toHaveBeenCalledWith(expect.anything(), {
      equipmentItemId: 'e1'
    })
    expect(listLog).toHaveBeenCalledWith(expect.anything(), {
      equipmentItemId: 'e1',
      limit: 10
    })
  })

  it('has no PAT status and zero hours on a plan without them', async () => {
    const care = await loadItemCare(
      makeContext({ planTier: PlanTier.FREE }),
      'e1'
    )
    expect(listPatStatus).not.toHaveBeenCalled()
    expect(care.pat).toBeNull()
    expect(care.usageHours).toBe(0)
  })
})
