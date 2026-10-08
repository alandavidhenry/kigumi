import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { isMemberRole, MemberRole, Permission } from '@/types/rbac'

// Read models over Better Auth's organisation tables. Mutations (invite,
// change role, remove) go through Better Auth's endpoints, which enforce the
// access control in src/lib/auth-permissions.ts. Member/Invitation are not
// tenantDb models (Better Auth owns them and spells it organizationId), so
// every query here filters by the context's organisation explicitly.

export interface MemberRow {
  id: string
  userId: string
  name: string
  email: string
  role: MemberRole
  joinedAt: Date
}

export interface InvitationRow {
  id: string
  email: string
  role: MemberRole
  expiresAt: Date
  inviterName: string
}

export interface OrganisationOption {
  id: string
  name: string
  role: MemberRole
}

const toRole = (role: string | null | undefined) =>
  isMemberRole(role) ? role : MemberRole.VIEWER

export async function listMembers(ctx: TenantContext): Promise<MemberRow[]> {
  requirePermission(ctx, Permission.VIEW_MEMBERS)
  const members = await prisma.member.findMany({
    where: { organizationId: ctx.organisationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { name: true, email: true } }
    }
  })
  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: toRole(member.role),
    joinedAt: member.createdAt
  }))
}

export async function listPendingInvitations(
  ctx: TenantContext,
  now: Date = new Date()
): Promise<InvitationRow[]> {
  requirePermission(ctx, Permission.MANAGE_MEMBERS)
  const invitations = await prisma.invitation.findMany({
    where: {
      organizationId: ctx.organisationId,
      status: 'pending',
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      user: { select: { name: true } }
    }
  })
  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: toRole(invitation.role),
    expiresAt: invitation.expiresAt,
    inviterName: invitation.user.name
  }))
}

// Organisations the user belongs to, for the organisation switcher.
export async function listMyOrganisations(
  userId: string
): Promise<OrganisationOption[]> {
  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, organization: { select: { id: true, name: true } } }
  })
  return memberships.map(({ role, organization }) => ({
    id: organization.id,
    name: organization.name,
    role: toRole(role)
  }))
}

export async function countMembers(ctx: TenantContext): Promise<number> {
  requirePermission(ctx, Permission.VIEW_MEMBERS)
  return prisma.member.count({ where: { organizationId: ctx.organisationId } })
}
