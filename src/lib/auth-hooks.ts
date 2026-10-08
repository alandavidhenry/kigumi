import { APIError } from 'better-auth/api'

import { writeAuditLog } from '@/lib/audit'
import { getPlanLimits } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { countUsedSeats } from '@/lib/seats'
import { MEMBER_ROLE_LABELS, isMemberRole } from '@/types/rbac'

// Hook bodies wired into Better Auth in src/lib/auth.ts, kept here so they can
// be unit tested without constructing the auth instance.

interface OrgRef {
  id: string
  name: string
  planTier?: unknown
}
interface UserRef {
  id: string
  name: string
}
interface MemberRef {
  id: string
  role: string
}
interface InvitationRef {
  id: string
  email: string
  role: string
}

export function appUrl(path = ''): string {
  const base = (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  )
  return `${base}${path}`
}

export function roleLabel(role: string): string {
  return isMemberRole(role) ? MEMBER_ROLE_LABELS[role] : role
}

// Land returning users in their first organisation.
export async function withDefaultActiveOrganisation<
  T extends { userId: string }
>(session: T): Promise<{ data: T & { activeOrganizationId: string | null } }> {
  const membership = await prisma.member.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true }
  })
  return {
    data: {
      ...session,
      activeOrganizationId: membership?.organizationId ?? null
    }
  }
}

export async function seatLimitFor(org: OrgRef): Promise<number> {
  return getPlanLimits(org.planTier).seats
}

export async function beforeCreateInvitation({
  invitation,
  organization
}: {
  invitation: { role: string }
  organization: OrgRef
}): Promise<void> {
  if (!isMemberRole(invitation.role)) {
    throw new APIError('BAD_REQUEST', { message: 'Unknown role' })
  }
  const seats = await seatLimitFor(organization)
  if ((await countUsedSeats(organization.id)) >= seats) {
    throw new APIError('FORBIDDEN', {
      message: `Your plan allows ${seats} seats, including pending invitations. Upgrade to invite more people.`
    })
  }
}

export async function beforeUpdateMemberRole({
  newRole
}: {
  newRole: string
}): Promise<void> {
  if (!isMemberRole(newRole)) {
    throw new APIError('BAD_REQUEST', { message: 'Unknown role' })
  }
}

export async function afterCreateOrganization({
  organization,
  user
}: {
  organization: OrgRef
  user: UserRef
}): Promise<void> {
  await writeAuditLog(organization.id, user.id, {
    action: 'organisation.create',
    entityType: 'organisation',
    entityId: organization.id,
    summary: `Created organisation ${organization.name}`
  })
}

export async function afterUpdateOrganization({
  organization,
  user
}: {
  organization: OrgRef | null
  user: UserRef
}): Promise<void> {
  if (!organization) return
  await writeAuditLog(organization.id, user.id, {
    action: 'organisation.update',
    entityType: 'organisation',
    entityId: organization.id,
    summary: `Updated organisation ${organization.name}`
  })
}

export async function afterCreateInvitation({
  invitation,
  inviter,
  organization
}: {
  invitation: InvitationRef
  inviter: UserRef
  organization: OrgRef
}): Promise<void> {
  await writeAuditLog(organization.id, inviter.id, {
    action: 'invitation.create',
    entityType: 'invitation',
    entityId: invitation.id,
    summary: `Invited ${invitation.email} as ${roleLabel(invitation.role)}`
  })
}

export async function afterCancelInvitation({
  invitation,
  cancelledBy,
  organization
}: {
  invitation: InvitationRef
  cancelledBy: UserRef
  organization: OrgRef
}): Promise<void> {
  await writeAuditLog(organization.id, cancelledBy.id, {
    action: 'invitation.cancel',
    entityType: 'invitation',
    entityId: invitation.id,
    summary: `Cancelled invitation for ${invitation.email}`
  })
}

export async function afterAcceptInvitation({
  member,
  user,
  organization
}: {
  member: MemberRef
  user: UserRef
  organization: OrgRef
}): Promise<void> {
  await writeAuditLog(organization.id, user.id, {
    action: 'member.join',
    entityType: 'member',
    entityId: member.id,
    summary: `${user.name} joined as ${roleLabel(member.role)}`
  })
}

// Better Auth passes the affected member's user here, not the actor, so the
// actor is left null rather than misattributed.
export async function afterUpdateMemberRole({
  member,
  previousRole,
  user,
  organization
}: {
  member: MemberRef
  previousRole: string
  user: UserRef
  organization: OrgRef
}): Promise<void> {
  await writeAuditLog(organization.id, null, {
    action: 'member.role-change',
    entityType: 'member',
    entityId: member.id,
    summary: `Changed ${user.name} from ${roleLabel(previousRole)} to ${roleLabel(member.role)}`
  })
}

export async function afterRemoveMember({
  member,
  user,
  organization
}: {
  member: MemberRef
  user: UserRef
  organization: OrgRef
}): Promise<void> {
  await writeAuditLog(organization.id, null, {
    action: 'member.remove',
    entityType: 'member',
    entityId: member.id,
    summary: `Removed ${user.name} from the organisation`
  })
}
