import { describe, expect, it } from 'vitest'

import {
  describeDays,
  describePat,
  describeTask,
  describeWarranty,
  formatBytes,
  formatDay
} from '@/lib/maintenance/format'

describe('formatDay', () => {
  it('formats a stored day in UK style regardless of the local time zone', () => {
    expect(formatDay('2026-11-05')).toBe('5 Nov 2026')
    expect(formatDay('2027-01-01')).toBe('1 Jan 2027')
  })

  it('shows a dash for nothing or nonsense', () => {
    expect(formatDay(null)).toBe('—')
    expect(formatDay('soon')).toBe('—')
  })
})

describe('describeDays', () => {
  it('reads naturally either side of today', () => {
    expect(describeDays(0)).toBe('today')
    expect(describeDays(1)).toBe('in 1 day')
    expect(describeDays(5)).toBe('in 5 days')
    expect(describeDays(-1)).toBe('1 day ago')
    expect(describeDays(-12)).toBe('12 days ago')
  })
})

describe('describeTask', () => {
  const base = { reason: null, daysLeft: null, hoursLeft: null } as const

  it('leads with whichever target tripped', () => {
    expect(
      describeTask({ ...base, state: 'overdue', reason: 'date', daysLeft: -12 })
    ).toBe('Overdue by 12 days')
    expect(
      describeTask({ ...base, state: 'overdue', reason: 'date', daysLeft: -1 })
    ).toBe('Overdue by 1 day')
    expect(
      describeTask({
        ...base,
        state: 'overdue',
        reason: 'hours',
        daysLeft: 90,
        hoursLeft: -10
      })
    ).toBe('Over by 10 h')
    expect(
      describeTask({ ...base, state: 'due_soon', reason: 'date', daysLeft: 5 })
    ).toBe('Due in 5 days')
    expect(
      describeTask({
        ...base,
        state: 'due_soon',
        reason: 'hours',
        hoursLeft: 40
      })
    ).toBe('Due in 40 h')
  })

  it('says “today” for a task due now, not “overdue by 0 days”', () => {
    expect(
      describeTask({ ...base, state: 'overdue', reason: 'date', daysLeft: 0 })
    ).toBe('Due today')
  })

  it('summarises an on-schedule task', () => {
    expect(describeTask({ ...base, state: 'ok', daysLeft: 60 })).toBe(
      'Due in 60 days'
    )
    expect(
      describeTask({ ...base, state: 'ok', daysLeft: 60, hoursLeft: 300 })
    ).toBe('Due in 60 days · 300 h to go')
    expect(describeTask({ ...base, state: 'ok' })).toBe('No schedule')
  })
})

describe('describePat and describeWarranty', () => {
  it('explains each PAT state', () => {
    expect(
      describePat({ state: 'failed', daysLeft: null, nextDueAt: null })
    ).toBe('Failed: retest after repair')
    expect(
      describePat({ state: 'overdue', daysLeft: -3, nextDueAt: '2026-05-01' })
    ).toBe('Was due 1 May 2026')
    expect(
      describePat({ state: 'ok', daysLeft: 200, nextDueAt: '2026-12-01' })
    ).toBe('Next 1 Dec 2026')
    expect(describePat({ state: 'ok', daysLeft: null, nextDueAt: null })).toBe(
      'No retest scheduled'
    )
  })

  it('explains a warranty before and after it ends', () => {
    expect(
      describeWarranty({
        state: 'expiring',
        endsOn: '2026-07-01',
        daysLeft: 16
      })
    ).toBe('Ends 1 Jul 2026 (in 16 days)')
    expect(
      describeWarranty({
        state: 'expired',
        endsOn: '2026-01-01',
        daysLeft: -100
      })
    ).toBe('Ended 1 Jan 2026')
  })
})

describe('formatBytes', () => {
  it('uses the largest sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
