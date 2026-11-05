import type { PatState, WarrantyState } from './schedule'
import type { DueState } from './types'

// Display text for dates and due states. Pure, so wording is unit tested.

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
})

// `YYYY-MM-DD` (as the lib returns dates) to "5 Nov 2026".
export function formatDay(value: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date)
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

export function describeDays(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  return daysLeft > 0
    ? `in ${plural(daysLeft, 'day')}`
    : `${plural(-daysLeft, 'day')} ago`
}

const hoursText = (n: number) => `${Math.abs(n)} h`

// "Overdue by 12 days", "Due in 5 days", "Over by 10 h", "Due in 40 h".
// Whichever target tripped (or is nearest) leads.
export function describeTask(task: {
  state: DueState
  reason: 'date' | 'hours' | null
  daysLeft: number | null
  hoursLeft: number | null
}): string {
  if (task.state === 'ok') {
    const parts = [
      task.daysLeft !== null && `Due ${describeDays(task.daysLeft)}`,
      task.hoursLeft !== null && `${hoursText(task.hoursLeft)} to go`
    ].filter(Boolean)
    return parts.join(' · ') || 'No schedule'
  }
  const overdue = task.state === 'overdue'
  if (task.reason === 'hours' && task.hoursLeft !== null) {
    return overdue
      ? `Over by ${hoursText(task.hoursLeft)}`
      : `Due in ${hoursText(task.hoursLeft)}`
  }
  if (task.daysLeft !== null) {
    if (!overdue) return `Due ${describeDays(task.daysLeft)}`
    return task.daysLeft === 0
      ? 'Due today'
      : `Overdue by ${plural(-task.daysLeft, 'day')}`
  }
  return overdue ? 'Overdue' : 'Due soon'
}

export const STATE_LABELS: Readonly<Record<DueState, string>> = {
  ok: 'On schedule',
  due_soon: 'Due soon',
  overdue: 'Overdue'
}

export const PAT_STATE_LABELS: Readonly<Record<PatState, string>> = {
  ok: 'In date',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  failed: 'Failed'
}

export const WARRANTY_STATE_LABELS: Readonly<Record<WarrantyState, string>> = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired'
}

export function describePat(test: {
  state: PatState
  daysLeft: number | null
  nextDueAt: string | null
}): string {
  if (test.state === 'failed') return 'Failed: retest after repair'
  if (!test.nextDueAt) return 'No retest scheduled'
  if (test.state === 'overdue') {
    return `Was due ${formatDay(test.nextDueAt)}`
  }
  return `Next ${formatDay(test.nextDueAt)}`
}

export function describeWarranty(warranty: {
  state: WarrantyState
  endsOn: string
  daysLeft: number
}): string {
  if (warranty.state === 'expired') {
    return `Ended ${formatDay(warranty.endsOn)}`
  }
  return `Ends ${formatDay(warranty.endsOn)} (${describeDays(warranty.daysLeft)})`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
