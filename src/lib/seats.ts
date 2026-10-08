import prisma from '@/lib/prisma'

// Members plus outstanding invitations count against the plan's seats, so an
// organisation can't invite past its limit and then accept everyone.
export async function countUsedSeats(
  organisationId: string,
  now: Date = new Date()
): Promise<number> {
  const [members, pendingInvitations] = await Promise.all([
    prisma.member.count({ where: { organizationId: organisationId } }),
    prisma.invitation.count({
      where: {
        organizationId: organisationId,
        status: 'pending',
        expiresAt: { gt: now }
      }
    })
  ])
  return members + pendingInvitations
}
