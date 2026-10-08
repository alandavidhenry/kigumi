import { APIError } from 'better-auth/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuditLog } from '@/lib/audit'
import {
  afterAcceptInvitation,
  afterCancelInvitation,
  afterCreateInvitation,
  afterCreateOrganization,
  afterRemoveMember,
  afterUpdateMemberRole,
  afterUpdateOrganization,
  appUrl,
  beforeCreateInvitation,
  beforeUpdateMemberRole,
  roleLabel,
  seatLimitFor,
  withDefaultActiveOrganisation
} from '@/lib/auth-hooks'
import prisma from '@/lib/prisma'
import { countUsedSeats } from '@/lib/seats'

vi.mock('@/lib/prisma', () => ({
  default: { member: { findFirst: vi.fn() } }
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/seats', () => ({ countUsedSeats: vi.fn() }))

const org = { id: 'org_1', name: 'Kigumi', planTier: 'free' }
const user = { id: 'user_1', name: 'Ada' }

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('appUrl', () => {
  it('defaults to localhost', () => {
    vi.stubEnv('BETTER_AUTH_URL', '')
    expect(appUrl('/x')).toBe('http://localhost:3000/x')
  })

  it('strips a trailing slash from the configured URL', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.kigumi.io/')
    expect(appUrl('/auth/accept-invite/1')).toBe(
      'https://app.kigumi.io/auth/accept-invite/1'
    )
  })
})

describe('roleLabel', () => {
  it('labels known roles and passes others through', () => {
    expect(roleLabel('engineer')).toBe('Engineer')
    expect(roleLabel('custom')).toBe('custom')
  })
})

describe('withDefaultActiveOrganisation', () => {
  it("sets the user's first organisation", async () => {
    vi.mocked(prisma.member.findFirst).mockResolvedValue({
      organizationId: 'org_1'
    } as never)
    const result = await withDefaultActiveOrganisation({
      userId: 'user_1',
      token: 't'
    })
    expect(result.data).toEqual({
      userId: 'user_1',
      token: 't',
      activeOrganizationId: 'org_1'
    })
  })

  it('leaves it null for users without an organisation', async () => {
    vi.mocked(prisma.member.findFirst).mockResolvedValue(null)
    const result = await withDefaultActiveOrganisation({ userId: 'user_1' })
    expect(result.data.activeOrganizationId).toBeNull()
  })
})

describe('seatLimitFor', () => {
  it('reads seats from the plan tier', async () => {
    expect(await seatLimitFor(org)).toBe(2)
    expect(await seatLimitFor({ ...org, planTier: 'studio' })).toBe(15)
  })
})

describe('beforeCreateInvitation', () => {
  it('allows an invitation within the seat limit', async () => {
    vi.mocked(countUsedSeats).mockResolvedValue(1)
    await expect(
      beforeCreateInvitation({
        invitation: { role: 'viewer' },
        organization: org
      })
    ).resolves.toBeUndefined()
  })

  it('rejects once members plus pending invitations fill the plan', async () => {
    vi.mocked(countUsedSeats).mockResolvedValue(2)
    await expect(
      beforeCreateInvitation({
        invitation: { role: 'viewer' },
        organization: org
      })
    ).rejects.toBeInstanceOf(APIError)
  })

  it('rejects unknown roles', async () => {
    await expect(
      beforeCreateInvitation({
        invitation: { role: 'admin' },
        organization: org
      })
    ).rejects.toBeInstanceOf(APIError)
    expect(countUsedSeats).not.toHaveBeenCalled()
  })
})

describe('beforeUpdateMemberRole', () => {
  it('accepts known roles and rejects others', async () => {
    await expect(
      beforeUpdateMemberRole({ newRole: 'manager' })
    ).resolves.toBeUndefined()
    await expect(
      beforeUpdateMemberRole({ newRole: 'member' })
    ).rejects.toBeInstanceOf(APIError)
  })
})

describe('audit hooks', () => {
  const invitation = { id: 'inv_1', email: 'bo@example.com', role: 'engineer' }
  const member = { id: 'mem_1', role: 'manager' }

  it('records organisation creation and updates', async () => {
    await afterCreateOrganization({ organization: org, user })
    expect(writeAuditLog).toHaveBeenCalledWith(
      'org_1',
      'user_1',
      expect.objectContaining({ action: 'organisation.create' })
    )

    await afterUpdateOrganization({ organization: org, user })
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      'org_1',
      'user_1',
      expect.objectContaining({ action: 'organisation.update' })
    )
  })

  it('skips updates without an organisation', async () => {
    await afterUpdateOrganization({ organization: null, user })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('records invitations', async () => {
    await afterCreateInvitation({
      invitation,
      inviter: user,
      organization: org
    })
    expect(writeAuditLog).toHaveBeenCalledWith(
      'org_1',
      'user_1',
      expect.objectContaining({
        action: 'invitation.create',
        summary: 'Invited bo@example.com as Engineer'
      })
    )

    await afterCancelInvitation({
      invitation,
      cancelledBy: user,
      organization: org
    })
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      'org_1',
      'user_1',
      expect.objectContaining({ action: 'invitation.cancel' })
    )
  })

  it('records membership changes', async () => {
    await afterAcceptInvitation({
      invitation,
      member,
      user,
      organization: org
    } as never)
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      'org_1',
      'user_1',
      expect.objectContaining({ summary: 'Ada joined as Manager' })
    )

    await afterUpdateMemberRole({
      member,
      previousRole: 'viewer',
      user,
      organization: org
    })
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      'org_1',
      null,
      expect.objectContaining({
        summary: 'Changed Ada from Viewer to Manager'
      })
    )

    await afterRemoveMember({ member, user, organization: org })
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      'org_1',
      null,
      expect.objectContaining({ action: 'member.remove' })
    )
  })
})
