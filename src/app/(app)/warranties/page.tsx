import {
  AddWarrantyButton,
  WarrantyList
} from '@/components/maintenance/warranty-list'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { listItemOptions } from '@/lib/maintenance/options'
import { listWarranties } from '@/lib/maintenance/warranty'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Warranties' }

export default async function WarrantiesPage() {
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const [warranties, items] = await Promise.all([
    listWarranties(ctx),
    listItemOptions(ctx)
  ])

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Warranties'
        description='Cover dates, providers and receipts. Soonest to expire first.'
        actions={canManage && <AddWarrantyButton items={items} />}
      />
      <Card>
        <CardContent className='pt-5 md:pt-6'>
          <WarrantyList
            warranties={warranties}
            items={items}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
