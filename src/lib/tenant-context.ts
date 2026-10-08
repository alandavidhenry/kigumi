import { headers } from 'next/headers'
import { cache } from 'react'

import { auth } from '@/lib/auth'
import { AppError, forbidden, unauthorized } from '@/lib/errors'
import { PlanTier, toPlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { hasPermission, isMemberRole, MemberRole } from '@/types/rbac'
import type { Permission } from '@/types/rbac'

export interface TenantContext {
  userId: string
  userName: string
  userEmail: string
  organisationId: string
  organisationName: string
  organisationSlug: string
  role: MemberRole
  planTier: PlanTier
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

// Resolves the signed-in user's active organisation and membership role.
// Cached per request so layouts, pages and lib calls share one lookup.
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const session = await getSession()
  if (!session) throw unauthorized()

  const organisationId = session.session.activeOrganizationId
  if (!organisationId) {
    throw new AppError(
      'NO_ACTIVE_ORGANISATION',
      'Create or choose an organisation first'
    )
  }

  const member = await prisma.member.findFirst({
    where: { organizationId: organisationId, userId: session.user.id },
    select: {
      role: true,
      organization: { select: { name: true, slug: true, planTier: true } }
    }
  })
  if (!member) {
    throw new AppError(
      'NO_ACTIVE_ORGANISATION',
      'You are not a member of that organisation'
    )
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    organisationId,
    organisationName: member.organization.name,
    organisationSlug: member.organization.slug,
    role: isMemberRole(member.role) ? member.role : MemberRole.VIEWER,
    planTier: toPlanTier(member.organization.planTier)
  }
})

export function requirePermission(
  ctx: Pick<TenantContext, 'role'>,
  permission: Permission
): void {
  if (!hasPermission(ctx.role, permission)) throw forbidden()
}
