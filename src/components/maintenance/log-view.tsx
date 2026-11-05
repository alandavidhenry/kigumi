'use client'

import { ClipboardList, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { EmptyState } from '@/components/empty-state'
import {
  FormDialog,
  FormField,
  today
} from '@/components/maintenance/form-dialog'
import { FileList, ItemSelect } from '@/components/maintenance/shared'
import type { ItemOption } from '@/components/maintenance/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/client-api'
import { formatDay } from '@/lib/maintenance/format'
import type { LogRow } from '@/lib/maintenance/service'
import { formatMoney, majorToMinor } from '@/lib/validation'

// A one-off entry (an unplanned repair, say). Planned work is logged by
// completing its task.
export function LogEntryDialog({
  items,
  fixedItemId,
  trigger
}: {
  readonly items: ItemOption[]
  readonly fixedItemId?: string
  readonly trigger: React.ReactNode
}) {
  const [itemId, setItemId] = useState(fixedItemId ?? '')
  const [title, setTitle] = useState('')
  const [performedAt, setPerformedAt] = useState(today())
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <FormDialog
      title='Log work'
      description='Record a repair or service that was not on a plan.'
      successMessage='Logged'
      trigger={trigger}
      onOpen={() => {
        setItemId(fixedItemId ?? '')
        setTitle('')
        setPerformedAt(today())
        setCost('')
        setNotes('')
      }}
      onSubmit={async () => {
        await apiFetch('/api/maintenance/log', {
          method: 'POST',
          body: {
            equipmentItemId: itemId,
            title,
            performedAt,
            notes,
            costMinor: cost ? majorToMinor(Number(cost)) : null
          }
        })
      }}
    >
      {!fixedItemId && (
        <FormField label='Item' htmlFor='log-item'>
          <ItemSelect
            id='log-item'
            value={itemId}
            onChange={setItemId}
            items={items}
          />
        </FormField>
      )}
      <FormField label='What was done' htmlFor='log-title'>
        <Input
          id='log-title'
          required
          maxLength={120}
          placeholder='e.g. Replaced XLR socket'
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField label='Done on' htmlFor='log-date'>
          <Input
            id='log-date'
            type='date'
            required
            max={today()}
            value={performedAt}
            onChange={(event) => setPerformedAt(event.target.value)}
          />
        </FormField>
        <FormField label='Cost (£)' htmlFor='log-cost'>
          <Input
            id='log-cost'
            type='number'
            min={0}
            step='0.01'
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </FormField>
      </div>
      <FormField label='Notes' htmlFor='log-notes'>
        <Textarea
          id='log-notes'
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}

export function LogEntryActions({
  items,
  fixedItemId
}: {
  readonly items: ItemOption[]
  readonly fixedItemId?: string
}) {
  return (
    <LogEntryDialog
      items={items}
      fixedItemId={fixedItemId}
      trigger={
        <Button variant='surface' size='sm'>
          <Plus />
          Log work
        </Button>
      }
    />
  )
}

export function LogList({
  entries,
  canManage,
  showItem = true
}: {
  readonly entries: LogRow[]
  readonly canManage: boolean
  readonly showItem?: boolean
}) {
  const router = useRouter()
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title='Nothing logged yet'
        description='Completed maintenance tasks and one-off repairs appear here, with their cost and attachments.'
      />
    )
  }

  const remove = (id: string) => async () => {
    await apiFetch(`/api/maintenance/log/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <ul className='divide-y'>
      {entries.map((entry) => (
        <li key={entry.id} className='space-y-2 py-3'>
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <div className='min-w-0'>
              <p className='font-medium'>
                {entry.title}
                {showItem && (
                  <>
                    {' '}
                    <span className='font-normal text-muted-foreground'>
                      ·
                    </span>{' '}
                    <Link
                      href={`/inventory/${entry.equipmentItemId}`}
                      className='font-normal hover:underline'
                    >
                      {entry.itemName}
                    </Link>
                  </>
                )}
              </p>
              <p className='text-xs text-muted-foreground'>
                {formatDay(entry.performedAt)}
                {entry.costMinor !== null &&
                  ` · ${formatMoney(entry.costMinor)}`}
                {entry.hoursAtService !== null &&
                  ` · at ${entry.hoursAtService} h`}
              </p>
            </div>
            {canManage && (
              <ConfirmDeleteButton
                title={`Delete “${entry.title}”?`}
                description='The entry and its attachments are permanently deleted.'
                label='Delete entry'
                size='icon'
                onConfirm={remove(entry.id)}
              />
            )}
          </div>
          {entry.notes && (
            <p className='whitespace-pre-line text-sm text-muted-foreground'>
              {entry.notes}
            </p>
          )}
          <FileList
            files={entry.files}
            canManage={canManage}
            uploadUrl={`/api/maintenance/log/${entry.id}/files`}
            label='Attach invoice'
          />
        </li>
      ))}
    </ul>
  )
}
