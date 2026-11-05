import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertCronAuthorised } from '@/lib/cron'
import { sendReminderDigestEmail } from '@/lib/email'
import { collectReminders, runReminders } from '@/lib/maintenance/reminders'
import prisma from '@/lib/prisma'

vi.mock('@/lib/email', () => ({ sendReminderDigestEmail: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 })
  })
  return {
    default: {
      organization: model(),
      member: model(),
      maintenanceTask: model(),
      warranty: model(),
      patTest: model(),
      usageCounter: model(),
      notification: model()
    }
  }
})

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const now = d('2026-06-01')
const plan = {
  title: 'Clean',
  intervalDays: 90,
  intervalHours: null,
  leadDays: 14
}
const none = { pat: null, warranties: [], tasks: [] }

describe('collectReminders', () => {
  it('raises nothing when everything is comfortably in date', () => {
    expect(
      collectReminders({
        now,
        tasks: [
          {
            id: 't1',
            dueAt: d('2026-12-01'),
            dueHours: null,
            itemName: 'U 87',
            currentHours: 0,
            plan
          }
        ],
        pat: [
          {
            id: 'p1',
            itemName: 'Amp',
            result: 'pass',
            testedAt: d('2026-05-01'),
            nextDueAt: d('2027-05-01')
          }
        ],
        warranties: [
          {
            id: 'w1',
            itemName: 'U 87',
            endsOn: d('2028-01-01'),
            leadDays: 30,
            provider: null
          }
        ]
      })
    ).toEqual([])
  })

  it('distinguishes due soon from overdue, and names the item and date', () => {
    const reminders = collectReminders({
      ...none,
      now,
      tasks: [
        {
          id: 'soon',
          dueAt: d('2026-06-10'),
          dueHours: null,
          itemName: 'U 87',
          currentHours: 0,
          plan
        },
        {
          id: 'late',
          dueAt: d('2026-05-01'),
          dueHours: null,
          itemName: 'SM57',
          currentHours: 0,
          plan
        }
      ]
    })
    expect(reminders).toEqual([
      expect.objectContaining({
        kind: 'maintenance_due',
        title: 'Clean: U 87',
        body: 'Due on 10 Jun 2026.',
        link: '/maintenance'
      }),
      expect.objectContaining({
        kind: 'maintenance_overdue',
        title: 'Clean: SM57',
        body: 'Overdue (was due on 1 May 2026).'
      })
    ])
  })

  it('reports usage-hour tasks in hours', () => {
    const [reminder] = collectReminders({
      ...none,
      now,
      tasks: [
        {
          id: 'h',
          dueAt: null,
          dueHours: 1000,
          itemName: 'Tube amp',
          currentHours: 1040,
          plan: { ...plan, intervalDays: null, intervalHours: 500 }
        }
      ]
    })
    expect(reminder).toMatchObject({
      kind: 'maintenance_overdue',
      body: 'Overdue (was due at 1000 hours).'
    })
  })

  it('moves the dedupe key when the due date moves, so the next cycle reminds again', () => {
    const run = (dueAt: string) =>
      collectReminders({
        ...none,
        now: d('2026-06-30'),
        tasks: [
          {
            id: 't1',
            dueAt: d(dueAt),
            dueHours: null,
            itemName: 'U 87',
            currentHours: 0,
            plan
          }
        ]
      })[0].dedupeKey
    expect(run('2026-06-10')).toBe(run('2026-06-10'))
    expect(run('2026-06-10')).not.toBe(run('2026-06-20'))
  })

  it('covers PAT states, including a failed test, and skips registers off the plan', () => {
    const base = { id: 'p', itemName: 'Amp', testedAt: d('2026-01-01') }
    const reminders = collectReminders({
      now,
      tasks: [],
      warranties: [],
      pat: [
        { ...base, id: 'due', result: 'pass', nextDueAt: d('2026-06-20') },
        { ...base, id: 'over', result: 'pass', nextDueAt: d('2026-05-01') },
        { ...base, id: 'fail', result: 'fail', nextDueAt: null },
        { ...base, id: 'ok', result: 'pass', nextDueAt: d('2027-01-01') }
      ]
    })
    expect(reminders.map((r) => r.kind)).toEqual([
      'pat_due',
      'pat_overdue',
      'pat_failed'
    ])
    expect(reminders[2].body).toContain('Keep it out of use')
    expect(collectReminders({ ...none, now, pat: null })).toEqual([])
  })

  it('warns before a warranty ends and shortly after, but not about old expiries', () => {
    const warranty = (id: string, endsOn: string) => ({
      id,
      itemName: 'U 87',
      endsOn: d(endsOn),
      leadDays: 30,
      provider: 'Sound Tech'
    })
    const reminders = collectReminders({
      ...none,
      now,
      warranties: [
        warranty('soon', '2026-06-20'),
        warranty('just', '2026-05-25'),
        warranty('ancient', '2025-01-01')
      ]
    })
    expect(reminders.map((r) => [r.kind, r.dedupeKey.split(':')[1]])).toEqual([
      ['warranty_expiring', 'soon'],
      ['warranty_expired', 'just']
    ])
    expect(reminders[0].body).toBe('Warranty (Sound Tech) ends on 20 Jun 2026.')
  })
})

describe('assertCronAuthorised', () => {
  const request = (authorization?: string) =>
    new Request('http://x', {
      headers: authorization ? { authorization } : {}
    })

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'correct-horse')
  })

  it('accepts the exact bearer secret', () => {
    expect(() =>
      assertCronAuthorised(request('Bearer correct-horse'))
    ).not.toThrow()
  })

  it('rejects a missing, wrong, truncated or longer secret', () => {
    for (const header of [
      undefined,
      'Bearer wrong',
      'Bearer correct-hors',
      'Bearer correct-horse!',
      'correct-horsf'
    ]) {
      expect(() => assertCronAuthorised(request(header))).toThrow()
    }
  })

  it('refuses everything when no secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(() => assertCronAuthorised(request('Bearer '))).toThrow()
    expect(() => assertCronAuthorised(request())).toThrow()
  })
})

describe('runReminders', () => {
  const mocked = vi.mocked(prisma, true) as unknown as Record<
    string,
    Record<string, ReturnType<typeof vi.fn>>
  >
  const owner = {
    userId: 'u-owner',
    user: { email: 'o@x.test', name: 'Olly' }
  }
  const engineer = {
    userId: 'u-eng',
    user: { email: 'e@x.test', name: 'Eve' }
  }
  const overdueTask = {
    id: 't1',
    equipmentItemId: 'e1',
    dueAt: d('2026-05-01'),
    dueHours: null,
    plan,
    equipmentItem: { make: 'Neumann', model: 'U 87' }
  }

  function setup(planTier: string) {
    mocked.organization.findMany.mockResolvedValue([
      { id: 'org_1', name: 'Northern Lights', planTier }
    ])
    mocked.member.findMany.mockResolvedValue([owner, engineer])
    mocked.maintenanceTask.findMany.mockResolvedValue([overdueTask])
    mocked.notification.createMany.mockResolvedValue({ count: 2 })
    mocked.notification.findMany.mockResolvedValue([
      { id: 'n1', userId: 'u-owner', title: 'Clean: Neumann U 87', body: 'x' },
      { id: 'n2', userId: 'u-eng', title: 'Clean: Neumann U 87', body: 'x' }
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    for (const model of Object.values(mocked)) {
      model.findMany?.mockResolvedValue([])
      model.createMany?.mockResolvedValue({ count: 0 })
      model.updateMany?.mockResolvedValue({ count: 0 })
    }
    vi.mocked(sendReminderDigestEmail).mockResolvedValue(undefined)
  })

  it('notifies owners, managers and engineers only, scoped to the organisation', async () => {
    setup('free')
    const result = await runReminders(now, 'https://kigumi.test')

    const roleFilter = mocked.member.findMany.mock.calls[0][0].where
    expect(roleFilter).toEqual({
      organizationId: 'org_1',
      role: { in: ['owner', 'manager', 'engineer'] }
    })
    // Every organisation-owned read names the organisation explicitly.
    for (const model of ['maintenanceTask', 'warranty', 'usageCounter']) {
      expect(mocked[model].findMany.mock.calls[0][0].where).toMatchObject({
        organisationId: 'org_1'
      })
    }
    const { data, skipDuplicates } =
      mocked.notification.createMany.mock.calls[0][0]
    expect(skipDuplicates).toBe(true)
    expect(data).toHaveLength(2)
    expect(data.map((row: { userId: string }) => row.userId)).toEqual([
      'u-owner',
      'u-eng'
    ])
    expect(data[0]).toMatchObject({
      organisationId: 'org_1',
      kind: 'maintenance_overdue',
      link: '/maintenance'
    })
    expect(result).toMatchObject({ organisations: 1, created: 2 })
  })

  it('sends no email on Free, but still raises the in-app reminders', async () => {
    setup('free')
    const result = await runReminders(now, 'https://kigumi.test')
    expect(sendReminderDigestEmail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: 2, emails: 0 })
  })

  it('does not look up PAT tests below the Studio plan', async () => {
    setup('pro')
    await runReminders(now, 'https://kigumi.test')
    expect(mocked.patTest.findMany).not.toHaveBeenCalled()
    setup('studio')
    await runReminders(now, 'https://kigumi.test')
    expect(mocked.patTest.findMany).toHaveBeenCalled()
  })

  it('emails one digest per person on Pro and marks only what was sent', async () => {
    setup('pro')
    const result = await runReminders(now, 'https://kigumi.test')

    expect(sendReminderDigestEmail).toHaveBeenCalledTimes(2)
    expect(sendReminderDigestEmail).toHaveBeenCalledWith(
      'o@x.test',
      'Olly',
      'Northern Lights',
      [{ title: 'Clean: Neumann U 87', body: 'x' }],
      'https://kigumi.test/notifications'
    )
    expect(mocked.notification.updateMany).toHaveBeenCalledWith({
      where: { organisationId: 'org_1', id: { in: ['n1'] } },
      data: { emailedAt: now }
    })
    expect(result).toMatchObject({ emails: 2, emailFailures: 0 })
  })

  it('only mails unread, recent, not-yet-emailed reminders', async () => {
    setup('pro')
    await runReminders(now, 'https://kigumi.test')
    const where = mocked.notification.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      organisationId: 'org_1',
      emailedAt: null,
      readAt: null,
      userId: { in: ['u-owner', 'u-eng'] }
    })
    expect(where.createdAt.gte).toEqual(d('2026-05-29'))
  })

  it('a failed email leaves it unmarked for the next run and carries on', async () => {
    setup('pro')
    vi.mocked(sendReminderDigestEmail)
      .mockRejectedValueOnce(new Error('ACS down'))
      .mockResolvedValueOnce(undefined)
    const result = await runReminders(now, 'https://kigumi.test')
    expect(result).toMatchObject({ emails: 1, emailFailures: 1 })
    expect(mocked.notification.updateMany).toHaveBeenCalledTimes(1)
    expect(mocked.notification.updateMany.mock.calls[0][0].where.id).toEqual({
      in: ['n2']
    })
  })

  it('one failing organisation does not stop the others', async () => {
    mocked.organization.findMany.mockResolvedValue([
      { id: 'bad', name: 'Bad', planTier: 'free' },
      { id: 'good', name: 'Good', planTier: 'free' }
    ])
    mocked.member.findMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([owner])
    mocked.maintenanceTask.findMany.mockResolvedValue([overdueTask])
    mocked.notification.createMany.mockResolvedValue({ count: 1 })

    const result = await runReminders(now, 'https://kigumi.test')
    expect(result).toMatchObject({ organisations: 1, created: 1 })
  })

  it('creates nothing when there is nothing to remind about or nobody to tell', async () => {
    setup('free')
    mocked.maintenanceTask.findMany.mockResolvedValue([])
    await runReminders(now, 'https://kigumi.test')
    expect(mocked.notification.createMany).not.toHaveBeenCalled()

    setup('free')
    mocked.member.findMany.mockResolvedValue([])
    await runReminders(now, 'https://kigumi.test')
    expect(mocked.notification.createMany).not.toHaveBeenCalled()
  })
})
