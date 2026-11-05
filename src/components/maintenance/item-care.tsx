'use client'

import { Gauge } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { LogEntryActions, LogList } from '@/components/maintenance/log-view'
import { RecordPatButton } from '@/components/maintenance/pat-register'
import { PlanDialog } from '@/components/maintenance/plan-dialog'
import { StateBadge } from '@/components/maintenance/shared'
import { CompleteTaskDialog } from '@/components/maintenance/task-list'
import {
  AddWarrantyButton,
  WarrantyList
} from '@/components/maintenance/warranty-list'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { apiFetch } from '@/lib/client-api'
import {
  PAT_STATE_LABELS,
  STATE_LABELS,
  describePat,
  describeTask
} from '@/lib/maintenance/format'
import type { ItemCare } from '@/lib/maintenance/overview'

// Maintenance, PAT, warranty and service history on an item's own page.
export function ItemCareCards({
  itemId,
  itemName,
  care,
  canManage,
  hoursAllowed,
  patAllowed
}: {
  readonly itemId: string
  readonly itemName: string
  readonly care: ItemCare
  readonly canManage: boolean
  readonly hoursAllowed: boolean
  readonly patAllowed: boolean
}) {
  const router = useRouter()
  const [hours, setHours] = useState(String(care.usageHours))
  const [saving, setSaving] = useState(false)
  const items = [{ id: itemId, name: itemName }]

  const saveHours = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch(`/api/equipment/${itemId}/usage`, {
        method: 'PUT',
        body: { hours: Number(hours) }
      })
      toast({ title: 'Usage hours saved' })
      router.refresh()
    } catch (caught) {
      toast({
        title: caught instanceof Error ? caught.message : 'Could not save',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Maintenance</CardTitle>
          {canManage && (
            <PlanDialog
              items={items}
              fixedItemId={itemId}
              hoursAllowed={hoursAllowed}
              trigger={<Button variant='surface'>Add plan</Button>}
            />
          )}
        </CardHeader>
        <CardContent className='space-y-4'>
          {care.tasks.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No maintenance scheduled for this item.{' '}
              <Link
                href='/maintenance/plans'
                className='text-brand underline underline-offset-2'
              >
                See all plans
              </Link>
            </p>
          ) : (
            <ul className='divide-y'>
              {care.tasks.map((task) => (
                <li
                  key={task.id}
                  className='flex flex-wrap items-center justify-between gap-2 py-2'
                >
                  <div>
                    <p className='text-sm font-medium'>{task.planTitle}</p>
                    <p className='text-xs text-muted-foreground'>
                      {describeTask(task)}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <StateBadge
                      state={task.state}
                      label={STATE_LABELS[task.state]}
                    />
                    {canManage && <CompleteTaskDialog task={task} />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className='border-t pt-4'>
            {hoursAllowed ? (
              <form
                onSubmit={saveHours}
                className='flex flex-wrap items-end gap-2'
              >
                <div className='space-y-1.5'>
                  <label htmlFor='usage-hours' className='text-sm font-medium'>
                    Usage hours
                  </label>
                  <Input
                    id='usage-hours'
                    type='number'
                    min={0}
                    step='0.1'
                    disabled={!canManage}
                    className='w-32'
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                  />
                </div>
                {canManage && (
                  <Button type='submit' variant='surface' disabled={saving}>
                    <Gauge />
                    {saving ? 'Saving…' : 'Update'}
                  </Button>
                )}
              </form>
            ) : (
              <UpgradeNotice
                compact
                title='Track usage hours and schedule by them on the Studio plan'
                planLabel='Studio'
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>PAT testing</CardTitle>
          {canManage && patAllowed && (
            <RecordPatButton items={items} fixedItemId={itemId} />
          )}
        </CardHeader>
        <CardContent>
          {!patAllowed ? (
            <UpgradeNotice
              compact
              title='The PAT testing register is on the Studio plan'
              planLabel='Studio'
            />
          ) : care.pat ? (
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm text-muted-foreground'>
                {describePat(care.pat)}
              </p>
              <StateBadge
                state={care.pat.state}
                label={PAT_STATE_LABELS[care.pat.state]}
              />
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              No PAT test recorded for this item.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Warranty and receipts</CardTitle>
          {canManage && (
            <AddWarrantyButton items={items} fixedItemId={itemId} />
          )}
        </CardHeader>
        <CardContent>
          {care.warranties.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No warranty recorded.
            </p>
          ) : (
            <WarrantyList
              warranties={care.warranties}
              items={items}
              canManage={canManage}
              showItem={false}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Service history</CardTitle>
          {canManage && <LogEntryActions items={items} fixedItemId={itemId} />}
        </CardHeader>
        <CardContent>
          <LogList entries={care.log} canManage={canManage} showItem={false} />
        </CardContent>
      </Card>
    </>
  )
}
