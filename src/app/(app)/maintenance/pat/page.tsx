import { MaintenanceTabs } from '@/components/maintenance/maintenance-tabs'
import {
  PatTable,
  RecordPatButton
} from '@/components/maintenance/pat-register'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { listItemOptions } from '@/lib/maintenance/options'
import { listPatStatus } from '@/lib/maintenance/pat'
import { Feature, PLAN_LABELS, hasFeature, minimumTierFor } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'PAT testing' }

export default async function PatPage() {
  const ctx = await getTenantContext()
  const allowed = hasFeature(ctx.planTier, Feature.PAT_TESTING)
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const [tests, items] = allowed
    ? await Promise.all([
        listPatStatus(ctx),
        canManage ? listItemOptions(ctx) : []
      ])
    : [[], []]

  return (
    <div className='space-y-4'>
      <PageHeader
        title='PAT testing'
        description='UK portable appliance testing register: the latest test for each item, and when the next is due.'
        actions={allowed && canManage && <RecordPatButton items={items} />}
      />
      <MaintenanceTabs current='/maintenance/pat' />
      {allowed ? (
        <Card>
          <CardContent className='pt-6'>
            <PatTable tests={tests} items={items} canManage={canManage} />
          </CardContent>
        </Card>
      ) : (
        <UpgradeNotice
          title='The PAT testing register is on the Studio plan'
          description='Track every test, its result and when the next is due, with reminders before it lapses.'
          planLabel={PLAN_LABELS[minimumTierFor(Feature.PAT_TESTING)]}
        />
      )}
    </div>
  )
}
