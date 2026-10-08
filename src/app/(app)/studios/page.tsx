import { Building2, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StudioFormDialog } from '@/components/studios/studio-form-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { canAdd, formatLimit, getPlanLimits } from '@/lib/plans'
import { listStudios } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Studios & rooms' }

export default async function StudiosPage() {
  const ctx = await getTenantContext()
  const studios = await listStudios(ctx)
  const canManage = hasPermission(ctx.role, Permission.MANAGE_STUDIOS)
  const withinPlan = canAdd(ctx.planTier, 'studios', studios.length)
  const limit = getPlanLimits(ctx.planTier).studios

  const addButton = canManage ? (
    <StudioFormDialog
      trigger={
        <Button disabled={!withinPlan}>
          <Plus />
          New studio
        </Button>
      }
    />
  ) : null

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Studios & rooms'
        description={`${studios.length} of ${formatLimit(limit)} studios on your plan`}
        actions={addButton}
      />

      {!withinPlan && canManage && (
        <p className='text-sm text-muted-foreground'>
          You’ve reached your plan’s studio limit.
        </p>
      )}

      {studios.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title='No studios yet'
            description={
              canManage
                ? 'Add a studio, then give it rooms with their dimensions.'
                : 'An owner or manager hasn’t added any studios yet.'
            }
            action={addButton}
          />
        </Card>
      ) : (
        <Card className='divide-y overflow-hidden p-0'>
          {studios.map((studio) => (
            <Link
              key={studio.id}
              href={`/studios/${studio.id}`}
              className='flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent'
            >
              <Building2 className='h-4 w-4 shrink-0 text-muted-foreground' />
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>{studio.name}</p>
                <p className='truncate text-xs text-muted-foreground'>
                  {studio.address ?? studio.timezone}
                </p>
              </div>
              <span className='text-xs text-muted-foreground'>
                {studio.roomCount} {studio.roomCount === 1 ? 'room' : 'rooms'}
              </span>
              <ChevronRight className='h-4 w-4 text-muted-foreground' />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
