import { HOURS_DUE_SOON_FRACTION, PAT_LEAD_DAYS } from './types'

import type { DueState, PatResult } from './types'

// Pure scheduling rules. Times are UTC; dates are whole UTC days.

const DAY_MS = 86_400_000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

// Calendar months, clamped to the last day of a shorter month (31 Jan + 1
// month = 28/29 Feb), never rolling into the next one.
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS)
}

export interface PlanIntervals {
  intervalDays: number | null
  intervalHours: number | null
}

export interface TaskDue {
  dueAt: Date | null
  dueHours: number | null
}

// The first due point of a task: from the plan's start (or when it was
// created) and from the item's usage hours at that moment.
export function initialDue(
  plan: PlanIntervals & { startsOn: Date | null; createdAt: Date },
  currentHours: number
): TaskDue {
  return {
    dueAt: plan.intervalDays
      ? addDays(plan.startsOn ?? plan.createdAt, plan.intervalDays)
      : null,
    dueHours: plan.intervalHours ? currentHours + plan.intervalHours : null
  }
}

// After a completion the next occurrence counts from the work, not from the
// old due date, so a late service doesn't leave the next one already overdue.
export function nextDue(
  plan: PlanIntervals,
  performedAt: Date,
  hoursAtService: number
): TaskDue {
  return {
    dueAt: plan.intervalDays ? addDays(performedAt, plan.intervalDays) : null,
    dueHours: plan.intervalHours ? hoursAtService + plan.intervalHours : null
  }
}

export interface TaskState {
  state: DueState
  // Days until due (negative when overdue); null with no date.
  daysLeft: number | null
  // Hours until due (negative when over); null with no hours target.
  hoursLeft: number | null
  reason: 'date' | 'hours' | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

// A task is overdue when either its date or its hours have passed, and due
// soon inside the lead time (days) or the last tenth of an hours interval.
export function taskState(
  task: TaskDue,
  plan: PlanIntervals & { leadDays: number },
  currentHours: number,
  now: Date
): TaskState {
  const daysLeft = task.dueAt ? daysBetween(now, task.dueAt) : null
  const hoursLeft =
    task.dueHours === null ? null : round1(task.dueHours - currentHours)

  const overdueByDate =
    task.dueAt !== null && task.dueAt.getTime() <= now.getTime()
  const overdueByHours = hoursLeft !== null && hoursLeft <= 0
  if (overdueByDate || overdueByHours) {
    return {
      state: 'overdue',
      daysLeft,
      hoursLeft,
      reason: overdueByDate ? 'date' : 'hours'
    }
  }
  const soonByDate = daysLeft !== null && daysLeft <= plan.leadDays
  const soonByHours =
    hoursLeft !== null &&
    plan.intervalHours !== null &&
    hoursLeft <= plan.intervalHours * HOURS_DUE_SOON_FRACTION
  return {
    state: soonByDate || soonByHours ? 'due_soon' : 'ok',
    daysLeft,
    hoursLeft,
    reason: soonByDate ? 'date' : soonByHours ? 'hours' : null
  }
}

export interface PatLike {
  result: PatResult
  testedAt: Date
  nextDueAt: Date | null
}

export type PatState = 'ok' | 'due_soon' | 'overdue' | 'failed'

// Status comes from the item's latest test only. A failed item stays failed
// until it is retested and passes.
export function patState(latest: PatLike, now: Date): PatState {
  if (latest.result === 'fail') return 'failed'
  if (!latest.nextDueAt) return 'ok'
  if (latest.nextDueAt.getTime() <= now.getTime()) return 'overdue'
  return daysBetween(now, latest.nextDueAt) <= PAT_LEAD_DAYS ? 'due_soon' : 'ok'
}

export function patNextDue(
  result: PatResult,
  testedAt: Date,
  intervalMonths: number
): Date | null {
  return result === 'pass' ? addMonths(testedAt, intervalMonths) : null
}

export type WarrantyState = 'active' | 'expiring' | 'expired'

export function warrantyState(
  warranty: { endsOn: Date; leadDays: number },
  now: Date
): WarrantyState {
  // A warranty covers the whole of its end date.
  const endOfCover = addDays(warranty.endsOn, 1)
  if (endOfCover.getTime() <= now.getTime()) return 'expired'
  return daysBetween(now, endOfCover) <= warranty.leadDays
    ? 'expiring'
    : 'active'
}
