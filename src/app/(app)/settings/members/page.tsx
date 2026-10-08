import { MembersManager } from '@/app/(app)/settings/members/members-manager'
import { PageHeader } from '@/components/page-header'
import { listMembers, listPendingInvitations } from '@/lib/members'
import { formatLimit, getPlanLimits } from '@/lib/plans'
import { countUsedSeats } from '@/lib/seats'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Members' }

export default async function MembersPage() {
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_MEMBERS)
  const [members, invitations, usedSeats] = await Promise.all([
    listMembers(ctx),
    canManage ? listPendingInvitations(ctx) : Promise.resolve([]),
    countUsedSeats(ctx.organisationId)
  ])
  const seats = getPlanLimits(ctx.planTier).seats

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Members'
        description={`${usedSeats} of ${formatLimit(seats)} seats used, including pending invitations`}
      />
      <MembersManager
        members={members}
        invitations={invitations}
        canManage={canManage}
        seatsAvailable={usedSeats < seats}
      />
    </div>
  )
}
