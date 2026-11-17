import { APIError } from 'better-auth/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertCanDeleteAccount,
  beforeDeleteUser,
  listSoleOwnerOrganisations,
  soleOwnerMessage
} from '@/lib/account'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: { member: { findMany: vi.fn(), count: vi.fn() } }
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))

const findMany = vi.mocked(prisma.member.findMany)
const count = vi.mocked(prisma.member.count)

function owned(...orgs: Array<[string, string]>) {
  findMany.mockResolvedValueOnce(
    orgs.map(([id, name]) => ({
      organizationId: id,
      organization: { name }
    })) as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listSoleOwnerOrganisations', () => {
  it('returns only organisations with no other owner', async () => {
    owned(['org_1', 'Solo'], ['org_2', 'Shared'])
    count.mockResolvedValueOnce(0 as never).mockResolvedValueOnce(1 as never)
    expect(await listSoleOwnerOrganisations('user_1')).toEqual([
      { id: 'org_1', name: 'Solo' }
    ])
  })

  it('is empty when the user owns nothing', async () => {
    owned()
    expect(await listSoleOwnerOrganisations('user_1')).toEqual([])
  })

  it('counts other owners, excluding the user', async () => {
    owned(['org_1', 'Solo'])
    count.mockResolvedValueOnce(0 as never)
    await listSoleOwnerOrganisations('user_1')
    expect(count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        role: 'owner',
        userId: { not: 'user_1' }
      }
    })
  })
})

describe('soleOwnerMessage', () => {
  it('names every blocking organisation', () => {
    expect(
      soleOwnerMessage([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' }
      ])
    ).toContain('Alpha, Beta')
  })
})

describe('assertCanDeleteAccount', () => {
  it('rejects a sole owner with a 400', async () => {
    owned(['org_1', 'Solo'])
    count.mockResolvedValueOnce(0 as never)
    await expect(assertCanDeleteAccount('user_1')).rejects.toBeInstanceOf(
      APIError
    )
  })

  it('allows a user who is not a sole owner', async () => {
    owned(['org_1', 'Shared'])
    count.mockResolvedValueOnce(2 as never)
    await expect(assertCanDeleteAccount('user_1')).resolves.toBeUndefined()
  })
})

describe('beforeDeleteUser', () => {
  it('audits each membership before the user is removed', async () => {
    owned()
    findMany.mockResolvedValueOnce([
      { id: 'mem_1', organizationId: 'org_1' },
      { id: 'mem_2', organizationId: 'org_2' }
    ] as never)
    await beforeDeleteUser({ id: 'user_1', name: 'Ada' })
    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog).toHaveBeenCalledWith('org_1', null, {
      action: 'member.remove',
      entityType: 'member',
      entityId: 'mem_1',
      summary: 'Ada deleted their account'
    })
  })

  it('writes nothing when deletion is blocked', async () => {
    owned(['org_1', 'Solo'])
    count.mockResolvedValueOnce(0 as never)
    await expect(
      beforeDeleteUser({ id: 'user_1', name: 'Ada' })
    ).rejects.toBeInstanceOf(APIError)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
