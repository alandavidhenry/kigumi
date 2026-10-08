import { OrganisationForm } from '@/app/(app)/settings/organisation/organisation-form'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { countMembers } from '@/lib/members'
import { PLAN_LABELS, formatLimit, getPlanLimits } from '@/lib/plans'
import { getOrganisationUsage } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Organisation' }

export default async function OrganisationSettingsPage() {
  const ctx = await getTenantContext()
  const [usage, members] = await Promise.all([
    getOrganisationUsage(ctx),
    countMembers(ctx)
  ])
  const limits = getPlanLimits(ctx.planTier)

  const rows = [
    { label: 'Studios', used: usage.studios, limit: limits.studios },
    { label: 'Rooms', used: usage.rooms, limit: limits.rooms },
    { label: 'Members', used: members, limit: limits.seats },
    {
      label: 'AI requests / month',
      used: null,
      limit: limits.aiRequestsPerMonth
    }
  ]

  return (
    <div className='space-y-6'>
      <PageHeader title='Organisation' description={ctx.organisationName} />

      <OrganisationForm
        name={ctx.organisationName}
        canEdit={hasPermission(ctx.role, Permission.EDIT_ORGANISATION)}
      />

      <Card>
        <CardHeader>
          <CardTitle>{PLAN_LABELS[ctx.planTier]} plan</CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <dl className='divide-y border-t'>
            {rows.map(({ label, used, limit }) => (
              <div
                key={label}
                className='flex items-center justify-between px-4 py-3'
              >
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='font-mono'>
                  {used === null ? '' : `${used} / `}
                  {formatLimit(limit)}
                </dd>
              </div>
            ))}
          </dl>
          <p className='px-4 py-3 text-xs text-muted-foreground'>
            Billing isn’t live yet. Contact us to change plans.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
