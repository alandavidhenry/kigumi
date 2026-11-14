import { LogEntryActions, LogList } from '@/components/maintenance/log-view'
import { MaintenanceTabs } from '@/components/maintenance/maintenance-tabs'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { listItemOptions } from '@/lib/maintenance/options'
import { listLog } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Service log' }

export default async function LogPage() {
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const [entries, items] = await Promise.all([
    listLog(ctx),
    canManage ? listItemOptions(ctx) : []
  ])

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Service log'
        description='Everything that has been done, with cost and invoices.'
        actions={canManage && <LogEntryActions items={items} />}
      />
      <MaintenanceTabs current='/maintenance/log' />
      <Card>
        <CardContent className='pt-5 md:pt-6'>
          <LogList entries={entries} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  )
}
