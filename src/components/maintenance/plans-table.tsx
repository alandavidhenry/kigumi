'use client'

import { Pencil, Repeat } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EmptyState } from '@/components/empty-state'
import { PlanDialog } from '@/components/maintenance/plan-dialog'
import type { ItemOption } from '@/components/maintenance/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/client-api'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-types'
import type { PlanRow } from '@/lib/maintenance/service'

function every(plan: PlanRow) {
  const parts = [
    plan.intervalDays && `every ${plan.intervalDays} days`,
    plan.intervalHours && `every ${plan.intervalHours} usage hours`
  ].filter(Boolean)
  return parts.join(' or ')
}

export function PlansTable({
  plans,
  items,
  canManage,
  hoursAllowed
}: {
  readonly plans: PlanRow[]
  readonly items: ItemOption[]
  readonly canManage: boolean
  readonly hoursAllowed: boolean
}) {
  const router = useRouter()
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title='No maintenance plans yet'
        description='A plan repeats a job (cleaning, re-valving, checking cables) by time, by usage hours, or both.'
      />
    )
  }
  const remove = (id: string) => async () => {
    await apiFetch(`/api/maintenance/plans/${id}`, { method: 'DELETE' })
    router.refresh()
  }
  return (
    <ul className='divide-y'>
      {plans.map((plan) => (
        <li
          key={plan.id}
          className='flex flex-wrap items-center justify-between gap-3 py-3'
        >
          <div className='min-w-0 space-y-0.5'>
            <p className='font-medium'>{plan.title}</p>
            <p className='text-xs text-muted-foreground'>
              {plan.itemName ??
                `All ${EQUIPMENT_CATEGORY_LABELS[plan.category!].toLowerCase()}`}{' '}
              · {every(plan)} · remind {plan.leadDays} days before ·{' '}
              {plan.taskCount} {plan.taskCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {!plan.active && <Badge variant='secondary'>Inactive</Badge>}
            {canManage && (
              <>
                <PlanDialog
                  plan={plan}
                  items={items}
                  hoursAllowed={hoursAllowed}
                  trigger={
                    <Button variant='ghost' size='icon' aria-label='Edit plan'>
                      <Pencil />
                    </Button>
                  }
                />
                <ConfirmDeleteButton
                  title={`Delete “${plan.title}”?`}
                  description='Its upcoming tasks are removed. The service log keeps what was already done.'
                  label='Delete plan'
                  size='icon'
                  onConfirm={remove(plan.id)}
                />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
