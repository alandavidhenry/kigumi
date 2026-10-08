import { beforeEach, describe, expect, it, vi } from 'vitest'

import { auth } from '@/lib/auth'
import { Feature, PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import {
  getTenantContext,
  requireFeature,
  requirePermission
} from '@/lib/tenant-context'
import { MemberRole, Permission } from '@/types/rbac'

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
// React's cache() is a no-op outside a server request; make it explicit.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/prisma', () => ({
  default: { member: { findFirst: vi.fn() } }
}))

const getSession = vi.mocked(auth.api.getSession)
const findMember = vi.mocked(prisma.member.findFirst)

function session(activeOrganizationId: string | null) {
  return {
    session: { activeOrganizationId },
    user: { id: 'user_1', name: 'Ada', email: 'ada@example.com' }
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getTenantContext', () => {
  it('401s without a session', async () => {
    getSession.mockResolvedValue(null as never)
    await expect(getTenantContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401
    })
  })

  it('403s without an active organisation', async () => {
    getSession.mockResolvedValue(session(null))
    await expect(getTenantContext()).rejects.toMatchObject({
      code: 'NO_ACTIVE_ORGANISATION'
    })
  })

  it('403s when the user is not a member of the active organisation', async () => {
    getSession.mockResolvedValue(session('org_1'))
    findMember.mockResolvedValue(null)
    await expect(getTenantContext()).rejects.toMatchObject({
      code: 'NO_ACTIVE_ORGANISATION'
    })
    expect(findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', userId: 'user_1' }
      })
    )
  })

  it('builds the context from the membership', async () => {
    getSession.mockResolvedValue(session('org_1'))
    findMember.mockResolvedValue({
      role: 'manager',
      organization: { name: 'Kigumi', slug: 'kigumi', planTier: 'pro' }
    } as never)

    expect(await getTenantContext()).toEqual({
      userId: 'user_1',
      userName: 'Ada',
      userEmail: 'ada@example.com',
      organisationId: 'org_1',
      organisationName: 'Kigumi',
      organisationSlug: 'kigumi',
      role: MemberRole.MANAGER,
      planTier: 'pro'
    })
  })

  it('downgrades unknown roles to viewer and unknown tiers to free', async () => {
    getSession.mockResolvedValue(session('org_1'))
    findMember.mockResolvedValue({
      role: 'admin',
      organization: { name: 'K', slug: 'k', planTier: 'gold' }
    } as never)

    const ctx = await getTenantContext()
    expect(ctx.role).toBe(MemberRole.VIEWER)
    expect(ctx.planTier).toBe('free')
  })
})

describe('requirePermission', () => {
  it('passes when the role has the permission', () => {
    expect(() =>
      requirePermission({ role: MemberRole.OWNER }, Permission.MANAGE_STUDIOS)
    ).not.toThrow()
  })

  it('throws FORBIDDEN otherwise', () => {
    expect(() =>
      requirePermission({ role: MemberRole.VIEWER }, Permission.MANAGE_STUDIOS)
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
  })
})

describe('requireFeature', () => {
  it('passes when the plan includes the feature', () => {
    expect(() =>
      requireFeature({ planTier: PlanTier.PRO }, Feature.VALUATION_REPORT)
    ).not.toThrow()
  })

  it('names the cheapest plan that includes it', () => {
    expect(() =>
      requireFeature({ planTier: PlanTier.FREE }, Feature.AUDIT_LOG)
    ).toThrow(
      expect.objectContaining({
        code: 'FEATURE_NOT_IN_PLAN',
        message: 'Activity log is available on the Studio plan and above.'
      })
    )
  })
})
