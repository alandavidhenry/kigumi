import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonths,
  daysBetween,
  initialDue,
  nextDue,
  patNextDue,
  patState,
  taskState,
  warrantyState
} from '@/lib/maintenance/schedule'
import {
  completeTaskSchema,
  patInputSchema,
  planInputSchema,
  warrantyInputSchema
} from '@/lib/maintenance/schemas'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const iso = (date: Date | null) => date?.toISOString().slice(0, 10)

describe('date arithmetic', () => {
  it('adds days and months in UTC', () => {
    expect(iso(addDays(d('2026-01-30'), 3))).toBe('2026-02-02')
    expect(iso(addMonths(d('2026-03-15'), 12))).toBe('2027-03-15')
    expect(iso(addMonths(d('2026-11-30'), 3))).toBe('2027-02-28')
  })

  it('clamps to the end of a shorter month instead of rolling over', () => {
    expect(iso(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28')
    expect(iso(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29')
    expect(iso(addMonths(d('2026-08-31'), 6))).toBe('2027-02-28')
  })

  it('counts whole days, rounding a partial day up', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-01-11'))).toBe(10)
    expect(daysBetween(new Date('2026-01-01T12:00:00Z'), d('2026-01-02'))).toBe(
      1
    )
  })
})

describe('first and next due point', () => {
  const plan = {
    intervalDays: 90,
    intervalHours: 500,
    startsOn: null,
    createdAt: d('2026-01-01')
  }

  it('counts from the plan start (or creation) and the current hours', () => {
    expect(initialDue(plan, 120)).toEqual({
      dueAt: d('2026-04-01'),
      dueHours: 620
    })
    expect(initialDue({ ...plan, startsOn: d('2026-02-01') }, 0).dueAt).toEqual(
      d('2026-05-02')
    )
  })

  it('leaves out the part a plan does not use', () => {
    expect(initialDue({ ...plan, intervalHours: null }, 50).dueHours).toBeNull()
    expect(initialDue({ ...plan, intervalDays: null }, 50).dueAt).toBeNull()
  })

  it('counts the next occurrence from the work, not the old due date', () => {
    expect(nextDue(plan, d('2026-06-10'), 900)).toEqual({
      dueAt: d('2026-09-08'),
      dueHours: 1400
    })
  })
})

describe('taskState', () => {
  const plan = { intervalDays: 90, intervalHours: 500, leadDays: 14 }
  const now = d('2026-06-01')

  it('is fine well before the due date', () => {
    expect(
      taskState({ dueAt: d('2026-09-01'), dueHours: null }, plan, 0, now).state
    ).toBe('ok')
  })

  it('is due soon inside the lead time, and on the boundary', () => {
    const soon = taskState(
      { dueAt: d('2026-06-15'), dueHours: null },
      plan,
      0,
      now
    )
    expect(soon).toMatchObject({
      state: 'due_soon',
      daysLeft: 14,
      reason: 'date'
    })
    expect(
      taskState({ dueAt: d('2026-06-16'), dueHours: null }, plan, 0, now).state
    ).toBe('ok')
  })

  it('is overdue on and after the due date', () => {
    expect(
      taskState({ dueAt: d('2026-06-01'), dueHours: null }, plan, 0, now).state
    ).toBe('overdue')
    expect(
      taskState({ dueAt: d('2026-05-20'), dueHours: null }, plan, 0, now)
    ).toMatchObject({ state: 'overdue', daysLeft: -12, reason: 'date' })
  })

  it('goes overdue on hours even when the date is far off', () => {
    expect(
      taskState({ dueAt: d('2027-01-01'), dueHours: 1000 }, plan, 1000, now)
    ).toMatchObject({ state: 'overdue', hoursLeft: 0, reason: 'hours' })
    expect(
      taskState({ dueAt: null, dueHours: 1000 }, plan, 1200.5, now).hoursLeft
    ).toBe(-200.5)
  })

  it('is due soon in the last tenth of an hours interval', () => {
    // 10% of 500 h = 50 h.
    expect(
      taskState({ dueAt: null, dueHours: 1000 }, plan, 950, now)
    ).toMatchObject({ state: 'due_soon', reason: 'hours' })
    expect(
      taskState({ dueAt: null, dueHours: 1000 }, plan, 949, now).state
    ).toBe('ok')
  })

  it('reports nothing for a task with no targets', () => {
    expect(taskState({ dueAt: null, dueHours: null }, plan, 10, now)).toEqual({
      state: 'ok',
      daysLeft: null,
      hoursLeft: null,
      reason: null
    })
  })
})

describe('PAT', () => {
  const now = d('2026-06-01')

  it('schedules the next test only after a pass', () => {
    expect(iso(patNextDue('pass', d('2026-06-01'), 12))).toBe('2027-06-01')
    expect(patNextDue('fail', d('2026-06-01'), 12)).toBeNull()
  })

  it('reads status from the latest test', () => {
    const pass = (nextDueAt: string | null) => ({
      result: 'pass' as const,
      testedAt: d('2025-06-01'),
      nextDueAt: nextDueAt ? d(nextDueAt) : null
    })
    expect(patState(pass('2027-01-01'), now)).toBe('ok')
    expect(patState(pass('2026-06-30'), now)).toBe('due_soon')
    expect(patState(pass('2026-07-01'), now)).toBe('due_soon')
    expect(patState(pass('2026-07-02'), now)).toBe('ok')
    expect(patState(pass('2026-06-01'), now)).toBe('overdue')
    expect(patState(pass(null), now)).toBe('ok')
  })

  it('keeps a failed item failed until a later pass replaces the test', () => {
    expect(
      patState(
        { result: 'fail', testedAt: d('2026-05-01'), nextDueAt: null },
        now
      )
    ).toBe('failed')
  })
})

describe('warrantyState', () => {
  const warranty = { endsOn: d('2026-06-30'), leadDays: 30 }

  it('is active before the lead window, expiring inside it', () => {
    expect(warrantyState(warranty, d('2026-05-01'))).toBe('active')
    expect(warrantyState(warranty, d('2026-06-01'))).toBe('expiring')
  })

  it('covers the whole of the end date', () => {
    expect(warrantyState(warranty, new Date('2026-06-30T23:59:00Z'))).toBe(
      'expiring'
    )
    expect(warrantyState(warranty, d('2026-07-01'))).toBe('expired')
  })
})

describe('input schemas', () => {
  it('a plan needs exactly one target and at least one interval', () => {
    const base = { title: 'Clean', intervalDays: 30 }
    expect(
      planInputSchema.safeParse({ ...base, equipmentItemId: 'e1' }).success
    ).toBe(true)
    expect(
      planInputSchema.safeParse({ ...base, category: 'microphone' }).success
    ).toBe(true)
    expect(planInputSchema.safeParse(base).success).toBe(false)
    expect(
      planInputSchema.safeParse({
        ...base,
        equipmentItemId: 'e1',
        category: 'microphone'
      }).success
    ).toBe(false)
    expect(
      planInputSchema.safeParse({ title: 'Clean', equipmentItemId: 'e1' })
        .success
    ).toBe(false)
    expect(
      planInputSchema.safeParse({
        ...base,
        equipmentItemId: 'e1',
        intervalDays: 0
      }).success
    ).toBe(false)
  })

  it('applies lead-time defaults', () => {
    expect(
      planInputSchema.parse({
        title: 'Clean',
        intervalDays: 30,
        equipmentItemId: 'e1'
      })
    ).toMatchObject({ leadDays: 14, active: true })
    expect(
      warrantyInputSchema.parse({ equipmentItemId: 'e1', endsOn: '2027-01-01' })
        .leadDays
    ).toBe(30)
  })

  it('warranties cannot end before they start', () => {
    expect(
      warrantyInputSchema.safeParse({
        equipmentItemId: 'e1',
        startsOn: '2027-01-02',
        endsOn: '2027-01-01'
      }).success
    ).toBe(false)
  })

  it('PAT intervals are limited to the offered choices and dates cannot be future', () => {
    const ok = {
      equipmentItemId: 'e1',
      testedAt: '2026-01-01',
      result: 'pass'
    }
    expect(patInputSchema.parse(ok).intervalMonths).toBe(12)
    expect(patInputSchema.safeParse({ ...ok, intervalMonths: 5 }).success).toBe(
      false
    )
    expect(
      patInputSchema.safeParse({ ...ok, testedAt: '2999-01-01' }).success
    ).toBe(false)
    expect(patInputSchema.safeParse({ ...ok, result: 'maybe' }).success).toBe(
      false
    )
  })

  it('completion rejects a future date and negative cost', () => {
    expect(
      completeTaskSchema.safeParse({ performedAt: '2999-01-01' }).success
    ).toBe(false)
    expect(completeTaskSchema.safeParse({ costMinor: -1 }).success).toBe(false)
    expect(completeTaskSchema.parse({})).toMatchObject({
      notes: null,
      costMinor: null,
      hoursAtService: null
    })
  })
})
