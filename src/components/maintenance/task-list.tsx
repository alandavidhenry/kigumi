'use client'

import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { EmptyState } from '@/components/empty-state'
import {
  FormDialog,
  FormField,
  today
} from '@/components/maintenance/form-dialog'
import { StateBadge } from '@/components/maintenance/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/client-api'
import { STATE_LABELS, describeTask, formatDay } from '@/lib/maintenance/format'
import type { TaskRow } from '@/lib/maintenance/service'
import { majorToMinor } from '@/lib/validation'

export function CompleteTaskDialog({ task }: { readonly task: TaskRow }) {
  const [performedAt, setPerformedAt] = useState(today())
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [hours, setHours] = useState('')
  const reset = () => {
    setPerformedAt(today())
    setNotes('')
    setCost('')
    setHours('')
  }

  return (
    <FormDialog
      title={`Complete: ${task.planTitle}`}
      description={`${task.itemName}. The next occurrence counts from the day the work was done.`}
      submitLabel='Mark complete'
      successMessage='Logged'
      onOpen={reset}
      onSubmit={async () => {
        await apiFetch(`/api/maintenance/tasks/${task.id}/complete`, {
          method: 'POST',
          body: {
            performedAt,
            notes,
            costMinor: cost ? majorToMinor(Number(cost)) : null,
            hoursAtService: hours ? Number(hours) : null
          }
        })
      }}
      trigger={
        <Button variant='surface' size='sm'>
          <CheckCircle2 />
          Complete
        </Button>
      }
    >
      <FormField label='Done on' htmlFor={`done-${task.id}`}>
        <Input
          id={`done-${task.id}`}
          type='date'
          required
          max={today()}
          value={performedAt}
          onChange={(event) => setPerformedAt(event.target.value)}
        />
      </FormField>
      {task.intervalHours !== null && (
        <FormField
          label='Hour meter reading'
          htmlFor={`hours-${task.id}`}
          hint={`Currently recorded: ${task.currentHours} h. Leave blank to keep it.`}
        >
          <Input
            id={`hours-${task.id}`}
            type='number'
            min={0}
            step='0.1'
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </FormField>
      )}
      <FormField label='Cost (£)' htmlFor={`cost-${task.id}`}>
        <Input
          id={`cost-${task.id}`}
          type='number'
          min={0}
          step='0.01'
          value={cost}
          onChange={(event) => setCost(event.target.value)}
        />
      </FormField>
      <FormField
        label='Notes'
        htmlFor={`notes-${task.id}`}
        hint='Attach invoices from the service log afterwards.'
      >
        <Textarea
          id={`notes-${task.id}`}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}

export function TaskList({
  tasks,
  canManage,
  emptyTitle,
  emptyDescription
}: {
  readonly tasks: TaskRow[]
  readonly canManage: boolean
  readonly emptyTitle: string
  readonly emptyDescription?: string
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }
  return (
    <ul className='divide-y'>
      {tasks.map((task) => (
        <li
          key={task.id}
          className='flex flex-wrap items-center justify-between gap-3 py-3'
        >
          <div className='min-w-0 space-y-0.5'>
            <p className='font-medium'>
              {task.planTitle}{' '}
              <span className='font-normal text-muted-foreground'>·</span>{' '}
              <Link
                href={`/inventory/${task.equipmentItemId}`}
                className='font-normal hover:underline'
              >
                {task.itemName}
              </Link>
            </p>
            <p className='text-xs text-muted-foreground'>
              {describeTask(task)}
              {task.dueAt && ` · ${formatDay(task.dueAt)}`}
              {task.dueHours !== null && ` · at ${task.dueHours} h`}
              {task.lastDoneAt && ` · last done ${formatDay(task.lastDoneAt)}`}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <StateBadge state={task.state} label={STATE_LABELS[task.state]} />
            {canManage && <CompleteTaskDialog task={task} />}
          </div>
        </li>
      ))}
    </ul>
  )
}
