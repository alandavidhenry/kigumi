import { APIError } from 'better-auth/api'

import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/prisma'
import { MemberRole } from '@/types/rbac'

// Account deletion rules (ADR 0002). Organisation deletion is disabled
// (ADR 0019), so deleting the only owner would strand an organisation with
// nobody able to manage it. Deletion is refused until another owner exists.

export interface OwnedOrganisation {
  id: string
  name: string
}

// Organisations where this user is the only owner.
export async function listSoleOwnerOrganisations(
  userId: string
): Promise<OwnedOrganisation[]> {
  const owned = await prisma.member.findMany({
    where: { userId, role: MemberRole.OWNER },
    select: {
      organizationId: true,
      organization: { select: { name: true } }
    }
  })
  const otherOwners = await Promise.all(
    owned.map((member) =>
      prisma.member.count({
        where: {
          organizationId: member.organizationId,
          role: MemberRole.OWNER,
          userId: { not: userId }
        }
      })
    )
  )
  return owned
    .filter((_member, index) => otherOwners[index] === 0)
    .map((member) => ({
      id: member.organizationId,
      name: member.organization.name
    }))
}

export function soleOwnerMessage(organisations: OwnedOrganisation[]): string {
  const names = organisations.map((organisation) => organisation.name)
  return `You are the only owner of ${names.join(', ')}. Make someone else an owner in Members before deleting your account.`
}

export async function assertCanDeleteAccount(userId: string): Promise<void> {
  const blocking = await listSoleOwnerOrganisations(userId)
  if (blocking.length > 0) {
    throw new APIError('BAD_REQUEST', { message: soleOwnerMessage(blocking) })
  }
}

// Runs just before Better Auth deletes the user. Memberships cascade away, so
// each organisation keeps a record that the person left.
export async function beforeDeleteUser(user: {
  id: string
  name: string
}): Promise<void> {
  await assertCanDeleteAccount(user.id)
  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    select: { id: true, organizationId: true }
  })
  await Promise.all(
    memberships.map((member) =>
      writeAuditLog(member.organizationId, null, {
        action: 'member.remove',
        entityType: 'member',
        entityId: member.id,
        summary: `${user.name} deleted their account`
      })
    )
  )
}
