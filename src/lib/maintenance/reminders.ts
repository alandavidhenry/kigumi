import { sendReminderDigestEmail } from '@/lib/email'
import { Feature, hasFeature, toPlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { MemberRole } from '@/types/rbac'

import { patState, taskState, warrantyState, addDays } from './schedule'

import type { PatResult, NotificationKind } from './types'

// The daily reminder job (ADR 0009, 0018). It runs across organisations with
// no signed-in user, so it cannot use tenantDb: every query below names
// organisationId explicitly and every write sets it. Re-running is safe,
// because (userId, dedupeKey) is unique.

export interface Reminder {
  kind: NotificationKind
  dedupeKey: string
  title: string
  body: string
  link: string
}

export interface ReminderInput {
  now: Date
  tasks: Array<{
    id: string
    dueAt: Date | null
    dueHours: number | null
    itemName: string
    currentHours: number
    plan: {
      title: string
      intervalDays: number | null
      intervalHours: number | null
      leadDays: number
    }
  }>
  // The latest test of each item.
  pat: Array<{
    id: string
    itemName: string
    result: PatResult
    testedAt: Date
    nextDueAt: Date | null
  }> | null
  warranties: Array<{
    id: string
    itemName: string
    endsOn: Date
    leadDays: number
    provider: string | null
  }>
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
})
const fmt = (date: Date) => SHORT_DATE.format(date)
const keyDay = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : ''

// An expired warranty is only worth a reminder shortly after it ends.
const EXPIRED_NOTICE_DAYS = 14

// Pure: which reminders exist right now. Each key names the thing and the date
// it is due, so completing a task (which moves its date) lets the next cycle
// remind again, while the same overdue task is only reported once.
export function collectReminders({
  now,
  tasks,
  pat,
  warranties
}: ReminderInput): Reminder[] {
  const out: Reminder[] = []

  for (const task of tasks) {
    const state = taskState(task, task.plan, task.currentHours, now)
    if (state.state === 'ok') continue
    const overdue = state.state === 'overdue'
    const due =
      state.reason === 'hours'
        ? `at ${task.dueHours} hours`
        : task.dueAt
          ? `on ${fmt(task.dueAt)}`
          : ''
    out.push({
      kind: overdue ? 'maintenance_overdue' : 'maintenance_due',
      dedupeKey: `${overdue ? 'maintenance_overdue' : 'maintenance_due'}:${task.id}:${keyDay(task.dueAt)}:${task.dueHours ?? ''}`,
      title: `${task.plan.title}: ${task.itemName}`,
      body: overdue ? `Overdue (was due ${due}).` : `Due ${due}.`,
      link: '/maintenance'
    })
  }

  for (const test of pat ?? []) {
    const state = patState(test, now)
    if (state === 'ok') continue
    const kind: NotificationKind =
      state === 'failed'
        ? 'pat_failed'
        : state === 'overdue'
          ? 'pat_overdue'
          : 'pat_due'
    out.push({
      kind,
      dedupeKey: `${kind}:${test.id}`,
      title: `PAT test: ${test.itemName}`,
      body:
        state === 'failed'
          ? `Failed its PAT test on ${fmt(test.testedAt)}. Keep it out of use until it is repaired and retested.`
          : state === 'overdue'
            ? `PAT test was due ${fmt(test.nextDueAt!)}.`
            : `PAT test due ${fmt(test.nextDueAt!)}.`,
      link: '/maintenance/pat'
    })
  }

  for (const warranty of warranties) {
    const state = warrantyState(warranty, now)
    if (state === 'active') continue
    if (
      state === 'expired' &&
      addDays(warranty.endsOn, 1 + EXPIRED_NOTICE_DAYS).getTime() <=
        now.getTime()
    ) {
      continue
    }
    const kind: NotificationKind =
      state === 'expired' ? 'warranty_expired' : 'warranty_expiring'
    const provider = warranty.provider ? ` (${warranty.provider})` : ''
    out.push({
      kind,
      dedupeKey: `${kind}:${warranty.id}:${keyDay(warranty.endsOn)}`,
      title: `Warranty: ${warranty.itemName}`,
      body:
        state === 'expired'
          ? `Warranty${provider} ended on ${fmt(warranty.endsOn)}.`
          : `Warranty${provider} ends on ${fmt(warranty.endsOn)}.`,
      link: '/warranties'
    })
  }

  return out
}

export interface ReminderRunResult {
  organisations: number
  created: number
  emails: number
  emailFailures: number
}

// Roles that act on maintenance; viewers only read it.
const RECIPIENT_ROLES = [
  MemberRole.OWNER,
  MemberRole.MANAGER,
  MemberRole.ENGINEER
]
const MAX_REMINDERS_PER_ORG = 200
const ORG_BATCH = 100
// Only mail what is recent, so an org that upgrades later isn't sent a backlog.
const EMAIL_WINDOW_DAYS = 3

const itemName = (item: { make: string; model: string }) =>
  `${item.make} ${item.model}`

export async function runReminders(
  now: Date = new Date(),
  appUrl = process.env.BETTER_AUTH_URL ?? ''
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    organisations: 0,
    created: 0,
    emails: 0,
    emailFailures: 0
  }

  let cursor: string | undefined
  for (;;) {
    const orgs = await prisma.organization.findMany({
      take: ORG_BATCH,
      orderBy: { id: 'asc' },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, name: true, planTier: true }
    })
    if (orgs.length === 0) break
    cursor = orgs[orgs.length - 1].id

    for (const org of orgs) {
      try {
        const done = await remindOrganisation(org, now, appUrl)
        result.organisations += 1
        result.created += done.created
        result.emails += done.emails
        result.emailFailures += done.emailFailures
      } catch (error) {
        // One organisation's problem must not stop everyone else's reminders.
        console.error(`Reminders failed for organisation ${org.id}`, error)
      }
    }
    if (orgs.length < ORG_BATCH) break
  }
  return result
}

async function remindOrganisation(
  org: { id: string; name: string; planTier: string },
  now: Date,
  appUrl: string
) {
  const organisationId = org.id
  const tier = toPlanTier(org.planTier)
  const live = { status: { not: 'retired' } }

  const [members, tasks, warranties, patRows] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: organisationId, role: { in: RECIPIENT_ROLES } },
      select: { userId: true, user: { select: { email: true, name: true } } }
    }),
    prisma.maintenanceTask.findMany({
      where: {
        organisationId,
        plan: { active: true },
        equipmentItem: live
      },
      take: 2000,
      select: {
        id: true,
        equipmentItemId: true,
        dueAt: true,
        dueHours: true,
        plan: {
          select: {
            title: true,
            intervalDays: true,
            intervalHours: true,
            leadDays: true
          }
        },
        equipmentItem: { select: { make: true, model: true } }
      }
    }),
    prisma.warranty.findMany({
      where: { organisationId, equipmentItem: live },
      take: 2000,
      select: {
        id: true,
        endsOn: true,
        leadDays: true,
        provider: true,
        equipmentItem: { select: { make: true, model: true } }
      }
    }),
    hasFeature(tier, Feature.PAT_TESTING)
      ? prisma.patTest.findMany({
          where: { organisationId, equipmentItem: live },
          orderBy: [{ testedAt: 'desc' }, { createdAt: 'desc' }],
          take: 5000,
          select: {
            id: true,
            equipmentItemId: true,
            result: true,
            testedAt: true,
            nextDueAt: true,
            equipmentItem: { select: { make: true, model: true } }
          }
        })
      : Promise.resolve(null)
  ])

  const counters = await prisma.usageCounter.findMany({
    where: {
      organisationId,
      equipmentItemId: { in: tasks.map((task) => task.equipmentItemId) }
    },
    select: { equipmentItemId: true, hours: true }
  })
  const hours = new Map(counters.map((c) => [c.equipmentItemId, c.hours]))

  let latestPat: ReminderInput['pat'] = null
  if (patRows) {
    const seen = new Set<string>()
    latestPat = []
    for (const row of patRows) {
      if (seen.has(row.equipmentItemId)) continue
      seen.add(row.equipmentItemId)
      latestPat.push({
        id: row.id,
        itemName: itemName(row.equipmentItem),
        result: row.result as PatResult,
        testedAt: row.testedAt,
        nextDueAt: row.nextDueAt
      })
    }
  }

  const reminders = collectReminders({
    now,
    tasks: tasks.map((task) => ({
      id: task.id,
      dueAt: task.dueAt,
      dueHours: task.dueHours,
      itemName: itemName(task.equipmentItem),
      currentHours: hours.get(task.equipmentItemId) ?? 0,
      plan: task.plan
    })),
    pat: latestPat,
    warranties: warranties.map((w) => ({
      id: w.id,
      itemName: itemName(w.equipmentItem),
      endsOn: w.endsOn,
      leadDays: w.leadDays,
      provider: w.provider
    }))
  }).slice(0, MAX_REMINDERS_PER_ORG)

  let created = 0
  if (reminders.length > 0 && members.length > 0) {
    const inserted = await prisma.notification.createMany({
      data: members.flatMap((member) =>
        reminders.map((reminder) => ({
          organisationId,
          userId: member.userId,
          kind: reminder.kind,
          title: reminder.title,
          body: reminder.body,
          link: reminder.link,
          dedupeKey: reminder.dedupeKey
        }))
      ),
      skipDuplicates: true
    })
    created = inserted.count
  }

  let emails = 0
  let emailFailures = 0
  if (hasFeature(tier, Feature.EMAIL_REMINDERS)) {
    const pending = await prisma.notification.findMany({
      where: {
        organisationId,
        emailedAt: null,
        readAt: null,
        userId: { in: members.map((m) => m.userId) },
        createdAt: { gte: addDays(now, -EMAIL_WINDOW_DAYS) }
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, title: true, body: true }
    })
    const byUser = Map.groupBy(pending, (row) => row.userId)
    for (const member of members) {
      const rows = byUser.get(member.userId)
      if (!rows?.length) continue
      try {
        await sendReminderDigestEmail(
          member.user.email,
          member.user.name,
          org.name,
          rows.map((row) => ({ title: row.title, body: row.body ?? '' })),
          `${appUrl}/notifications`
        )
        await prisma.notification.updateMany({
          where: { organisationId, id: { in: rows.map((row) => row.id) } },
          data: { emailedAt: now }
        })
        emails += 1
      } catch (error) {
        // Left unmarked, so the next run tries again within the window.
        emailFailures += 1
        console.error(`Reminder email failed for ${member.userId}`, error)
      }
    }
  }

  return { created, emails, emailFailures }
}
