import { Plus } from 'lucide-react'

import { MaintenanceTabs } from '@/components/maintenance/maintenance-tabs'
import { PlanDialog } from '@/components/maintenance/plan-dialog'
import { PlansTable } from '@/components/maintenance/plans-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listItemOptions } from '@/lib/maintenance/options'
import { listPlans } from '@/lib/maintenance/service'
import { Feature, hasFeature } from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Maintenance plans' }

export default async function PlansPage() {
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const hoursAllowed = hasFeature(ctx.planTier, Feature.USAGE_HOUR_MAINTENANCE)
  const [plans, items] = await Promise.all([
    listPlans(ctx),
    listItemOptions(ctx)
  ])

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Maintenance plans'
        description='A plan covers one item or every item in a category.'
        actions={
          canManage && (
            <PlanDialog
              items={items}
              hoursAllowed={hoursAllowed}
              trigger={
                <Button>
                  <Plus />
                  New plan
                </Button>
              }
            />
          )
        }
      />
      <MaintenanceTabs current='/maintenance/plans' />
      <Card>
        <CardContent className='pt-6'>
          <PlansTable
            plans={plans}
            items={items}
            canManage={canManage}
            hoursAllowed={hoursAllowed}
          />
        </CardContent>
      </Card>
    </div>
  )
}
