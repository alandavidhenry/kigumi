import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  countMembers,
  listMembers,
  listMyOrganisations,
  listPendingInvitations
} from '@/lib/members'
import prisma from '@/lib/prisma'
import { makeContext } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/prisma', () => ({
  default: {
    member: { findMany: vi.fn(), count: vi.fn() },
    invitation: { findMany: vi.fn() }
  }
}))

const mocked = vi.mocked(prisma, true)
const owner = makeContext()
const engineer = makeContext({ role: MemberRole.ENGINEER })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listMembers', () => {
  it('lists members of the context organisation only', async () => {
    const joinedAt = new Date('2026-01-01')
    mocked.member.findMany.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        role: 'manager',
        createdAt: joinedAt,
        user: { name: 'Ada', email: 'ada@x.io' }
      },
      {
        id: 'm2',
        userId: 'u2',
        role: 'legacy',
        createdAt: joinedAt,
        user: { name: 'Bo', email: 'bo@x.io' }
      }
    ] as never)

    const members = await listMembers(engineer)

    expect(mocked.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } })
    )
    expect(members).toEqual([
      {
        id: 'm1',
        userId: 'u1',
        name: 'Ada',
        email: 'ada@x.io',
        role: MemberRole.MANAGER,
        joinedAt
      },
      expect.objectContaining({ id: 'm2', role: MemberRole.VIEWER })
    ])
  })
})

describe('listPendingInvitations', () => {
  it('lists live pending invitations for managers and owners', async () => {
    const now = new Date('2026-10-08')
    mocked.invitation.findMany.mockResolvedValue([
      {
        id: 'i1',
        email: 'cy@x.io',
        role: 'engineer',
        expiresAt: now,
        user: { name: 'Ada' }
      }
    ] as never)

    expect(await listPendingInvitations(owner, now)).toEqual([
      {
        id: 'i1',
        email: 'cy@x.io',
        role: MemberRole.ENGINEER,
        expiresAt: now,
        inviterName: 'Ada'
      }
    ])
    expect(mocked.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org_1',
          status: 'pending',
          expiresAt: { gt: now }
        }
      })
    )
  })

  it('is forbidden for engineers', async () => {
    await expect(listPendingInvitations(engineer)).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })
    expect(mocked.invitation.findMany).not.toHaveBeenCalled()
  })
})

describe('listMyOrganisations', () => {
  it("lists the user's organisations with their role", async () => {
    mocked.member.findMany.mockResolvedValue([
      { role: 'owner', organization: { id: 'o1', name: 'A' } }
    ] as never)
    expect(await listMyOrganisations('u1')).toEqual([
      { id: 'o1', name: 'A', role: MemberRole.OWNER }
    ])
    expect(mocked.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } })
    )
  })
})

describe('countMembers', () => {
  it('counts members in the organisation', async () => {
    mocked.member.count.mockResolvedValue(3 as never)
    expect(await countMembers(owner)).toBe(3)
    expect(mocked.member.count).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' }
    })
  })
})
