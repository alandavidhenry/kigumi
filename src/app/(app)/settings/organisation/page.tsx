import { OrganisationForm } from '@/app/(app)/settings/organisation/organisation-form'
import { PageHeader } from '@/components/page-header'
import { PlanComparison } from '@/components/plan-comparison'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { countMembers } from '@/lib/members'
import {
  PLAN_LABELS,
  formatLimit,
  formatStorage,
  getPlanLimits
} from '@/lib/plans'
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

  // Inventory, AI and storage usage are counted once those phases land.
  const rows = [
    {
      label: 'Studios',
      used: usage.studios,
      limit: formatLimit(limits.studios)
    },
    { label: 'Rooms', used: usage.rooms, limit: formatLimit(limits.rooms) },
    { label: 'Seats', used: members, limit: formatLimit(limits.seats) },
    {
      label: 'Inventory items',
      used: null,
      limit: formatLimit(limits.inventoryItems)
    },
    {
      label: 'AI requests / month',
      used: null,
      limit: formatLimit(limits.aiRequestsPerMonth)
    },
    {
      label: 'File storage',
      used: null,
      limit: formatStorage(limits.storageMb)
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
          <CardTitle>{PLAN_LABELS[ctx.planTier]} plan usage</CardTitle>
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
                  {limit}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className='space-y-3'>
        <div className='space-y-1'>
          <h2 className='text-base font-semibold'>Plans</h2>
          <p className='text-muted-foreground'>
            Online billing isn’t live yet. Contact us to change your plan.
            Prices are in GBP and annual plans get two months free.
          </p>
        </div>
        <PlanComparison current={ctx.planTier} />
      </section>
    </div>
  )
}
