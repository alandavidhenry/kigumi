import { Boxes, ChevronRight, Download, Plus } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { EquipmentFormDialog } from '@/components/inventory/equipment-form-dialog'
import { ImportDialog } from '@/components/inventory/import-dialog'
import { InventoryFilters } from '@/components/inventory/inventory-filters'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { countEquipment, listEquipment, listRoomOptions } from '@/lib/equipment'
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS
} from '@/lib/equipment-types'
import {
  Feature,
  PLAN_LABELS,
  canAdd,
  formatLimit,
  getPlanLimits,
  hasFeature,
  upgradeTierFor
} from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Inventory' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default async function InventoryPage({
  searchParams
}: {
  readonly searchParams: SearchParams
}) {
  const raw = await searchParams
  const filter: Record<string, string> = {}
  for (const key of ['q', 'category', 'status', 'roomId', 'tag']) {
    const value = first(raw[key])
    if (value) filter[key] = value
  }
  const filtered = Object.keys(filter).length > 0

  const ctx = await getTenantContext()
  const [items, total, rooms] = await Promise.all([
    listEquipment(ctx, filter),
    countEquipment(ctx),
    listRoomOptions(ctx)
  ])
  const canManage = hasPermission(ctx.role, Permission.MANAGE_INVENTORY)
  const withinPlan = canAdd(ctx.planTier, 'inventoryItems', total)
  const upgradeTier = upgradeTierFor(ctx.planTier, 'inventoryItems', total)
  const exportHref = `/api/equipment/export${
    filtered ? `?${new URLSearchParams(filter).toString()}` : ''
  }`

  const addButton = canManage ? (
    <EquipmentFormDialog
      rooms={rooms}
      trigger={
        <Button disabled={!withinPlan}>
          <Plus />
          Add item
        </Button>
      }
    />
  ) : null

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Inventory'
        description={`${total} of ${formatLimit(getPlanLimits(ctx.planTier).inventoryItems)} items on your plan`}
        actions={
          <div className='flex flex-wrap gap-2'>
            {canManage && <ImportDialog />}
            <Button asChild variant='surface'>
              <a href={exportHref}>
                <Download />
                Export CSV
              </a>
            </Button>
            {hasFeature(ctx.planTier, Feature.VALUATION_REPORT) ? (
              <Button asChild variant='surface'>
                <Link href='/inventory/valuation'>Valuation report</Link>
              </Button>
            ) : (
              <Button asChild variant='surface'>
                <Link href='/inventory/valuation'>Valuation (Pro)</Link>
              </Button>
            )}
            {addButton}
          </div>
        }
      />

      {!withinPlan && canManage && (
        <UpgradeNotice
          compact
          title='You’ve reached your plan’s inventory limit.'
          planLabel={upgradeTier ? PLAN_LABELS[upgradeTier] : null}
        />
      )}

      {total > 0 && <InventoryFilters rooms={rooms} />}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Boxes}
            title={
              filtered ? 'Nothing matches those filters' : 'No equipment yet'
            }
            description={
              filtered
                ? 'Try clearing the search or filters.'
                : canManage
                  ? 'Add your microphones, preamps, outboard and cables, or import a CSV.'
                  : 'Nobody has added any equipment yet.'
            }
            action={filtered ? null : addButton}
          />
        </Card>
      ) : (
        <Card className='divide-y overflow-hidden p-0'>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/inventory/${item.id}`}
              className='flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>
                  {item.make} {item.model}
                  {item.quantity > 1 && (
                    <span className='ml-2 text-xs font-normal text-muted-foreground'>
                      ×{item.quantity}
                    </span>
                  )}
                </p>
                <p className='truncate text-xs text-muted-foreground'>
                  {EQUIPMENT_CATEGORY_LABELS[item.category]}
                  {item.serial && ` · S/N ${item.serial}`}
                  {item.roomName && ` · ${item.roomName}`}
                </p>
              </div>
              {item.status !== 'in_service' && (
                <Badge
                  variant={item.status === 'repair' ? 'warning' : 'secondary'}
                >
                  {EQUIPMENT_STATUS_LABELS[item.status]}
                </Badge>
              )}
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
