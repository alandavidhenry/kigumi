import {
  Building2,
  CalendarPlus,
  ChevronDown,
  DoorOpen,
  Mic,
  Users,
  Wand2
} from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import type { DashboardTile } from '@/components/dashboard/dashboard-grid'
import { GettingStartedCard } from '@/components/dashboard/getting-started-card'
import { StateBadge } from '@/components/maintenance/shared'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { listAuditLog } from '@/lib/audit'
import { getDashboardLayout } from '@/lib/dashboard/preferences'
import { TILE_IDS, TILE_TITLES, type TileId } from '@/lib/dashboard/tiles'
import {
  PAT_STATE_LABELS,
  STATE_LABELS,
  WARRANTY_STATE_LABELS,
  describePat,
  describeTask,
  describeWarranty
} from '@/lib/maintenance/format'
import { loadDashboardCare } from '@/lib/maintenance/overview'
import { countMembers } from '@/lib/members'
import {
  Feature,
  PLAN_LABELS,
  formatLimit,
  getPlanLimits,
  hasFeature
} from '@/lib/plans'
import { formatSessionTime } from '@/lib/sessions/time'
import { getSetupProgress, isSetupRequired } from '@/lib/setup'
import { getOrganisationUsage } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Dashboard' }

const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export default async function DashboardPage() {
  const ctx = await getTenantContext()
  // First run: owners and managers finish or skip setup before anything else.
  if (await isSetupRequired(ctx)) redirect('/setup')

  const can = (permission: Permission) => hasPermission(ctx.role, permission)
  const canSeeActivity =
    can(Permission.VIEW_AUDIT_LOG) &&
    hasFeature(ctx.planTier, Feature.AUDIT_LOG)
  const showSetup =
    can(Permission.MANAGE_STUDIOS) || can(Permission.MANAGE_SESSIONS)
  const [usage, members, activity, care, setup, saved] = await Promise.all([
    getOrganisationUsage(ctx),
    countMembers(ctx),
    canSeeActivity ? listAuditLog(ctx, { limit: 8 }) : Promise.resolve([]),
    loadDashboardCare(ctx),
    showSetup ? getSetupProgress(ctx) : Promise.resolve(null),
    getDashboardLayout(ctx)
  ])
  const limits = getPlanLimits(ctx.planTier)

  const wizards = [
    can(Permission.MANAGE_SESSIONS) && {
      title: 'Plan a session',
      description: 'Ensemble, mics, layout and recall sheet in a few steps.',
      href: '/sessions/new',
      icon: CalendarPlus
    },
    can(Permission.MANAGE_MIC_LOCKER) && {
      title: 'Add microphones',
      description: 'Search the catalogue and add several at once.',
      href: '/locker',
      icon: Mic
    },
    can(Permission.MANAGE_STUDIOS) && {
      title: 'Studio setup',
      description: 'Studio, rooms, microphones and desk. Safe to re-run.',
      href: '/setup',
      icon: Wand2
    }
  ].filter((item) => item !== false)

  const stats = [
    {
      label: 'Studios',
      value: usage.studios,
      limit: limits.studios,
      icon: Building2,
      href: '/studios'
    },
    {
      label: 'Rooms',
      value: usage.rooms,
      limit: limits.rooms,
      icon: DoorOpen,
      href: '/studios'
    },
    {
      label: 'Members',
      value: members,
      limit: limits.seats,
      icon: Users,
      href: '/settings/members'
    }
  ]

  // Tiles in default order; the grid applies the person's saved arrangement.
  // A tile is omitted when their role or plan can't see it.
  const nodes: Partial<Record<TileId, React.ReactNode>> = {}

  if (setup && !setup.complete) {
    nodes['getting-started'] = <GettingStartedCard progress={setup} />
  }

  if (wizards.length > 0) {
    nodes.wizards = (
      <Card className='border-brand-border bg-brand-tint/20'>
        <CardHeader className='space-y-1'>
          <CardTitle>Guided wizards</CardTitle>
          <CardDescription>
            The quickest way to get something done.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className='grid gap-3 sm:grid-cols-3'>
            {wizards.map(({ title, description, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className='flex h-full flex-col gap-1 rounded-md border bg-card p-3 transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <span className='flex items-center gap-2 text-sm font-medium'>
                    <Icon className='size-4 text-brand' />
                    {title}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )
  }

  if (care.unreadNotifications > 0) {
    nodes.reminders = (
      <Link href='/notifications' className='block'>
        <Card className='border-brand-border bg-brand-tint/30 transition-colors hover:border-brand'>
          <CardContent className='py-3 text-sm'>
            You have {care.unreadNotifications} unread{' '}
            {care.unreadNotifications === 1 ? 'reminder' : 'reminders'}.
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (care.sessions) {
    nodes.sessions = (
      <Card className='h-full'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Upcoming sessions</CardTitle>
          <Button asChild variant='link' size='sm'>
            <Link href='/sessions'>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {care.sessions.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No sessions coming up.
            </p>
          ) : (
            <ul className='divide-y'>
              {care.sessions.map((session) => (
                <li key={session.id} className='py-2'>
                  <Link
                    href={`/sessions/${session.id}`}
                    className='font-medium hover:underline'
                  >
                    {session.name}
                  </Link>
                  <p className='text-xs text-muted-foreground'>
                    {formatSessionTime(
                      new Date(session.startsAt),
                      new Date(session.endsAt),
                      session.timeZone
                    )}
                    {session.roomName && ` · ${session.roomName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (care.tasks) {
    nodes.maintenance = (
      <Card className='h-full'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>
            Maintenance
            {care.overdueTasks > 0 && (
              <span className='ml-2 text-sm font-normal text-destructive'>
                {care.overdueTasks} overdue
              </span>
            )}
          </CardTitle>
          <Button asChild variant='link' size='sm'>
            <Link href='/maintenance'>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {care.tasks.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Nothing due or overdue.
            </p>
          ) : (
            <ul className='divide-y'>
              {care.tasks.map((task) => (
                <li
                  key={task.id}
                  className='flex items-center justify-between gap-2 py-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {task.planTitle} · {task.itemName}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {describeTask(task)}
                    </p>
                  </div>
                  <StateBadge
                    state={task.state}
                    label={STATE_LABELS[task.state]}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (care.pat) {
    nodes.pat = (
      <Card className='h-full'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>PAT testing</CardTitle>
          <Button asChild variant='link' size='sm'>
            <Link href='/maintenance/pat'>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {care.pat.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              All tested items are in date.
            </p>
          ) : (
            <ul className='divide-y'>
              {care.pat.map((test) => (
                <li
                  key={test.id}
                  className='flex items-center justify-between gap-2 py-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {test.itemName}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {describePat(test)}
                    </p>
                  </div>
                  <StateBadge
                    state={test.state}
                    label={PAT_STATE_LABELS[test.state]}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (care.warranties) {
    nodes.warranties = (
      <Card className='h-full'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Expiring warranties</CardTitle>
          <Button asChild variant='link' size='sm'>
            <Link href='/warranties'>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {care.warranties.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No warranties are about to end.
            </p>
          ) : (
            <ul className='divide-y'>
              {care.warranties.map((warranty) => (
                <li
                  key={warranty.id}
                  className='flex items-center justify-between gap-2 py-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {warranty.itemName}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {describeWarranty(warranty)}
                    </p>
                  </div>
                  <StateBadge
                    state={warranty.state}
                    label={WARRANTY_STATE_LABELS[warranty.state]}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (canSeeActivity) {
    nodes.activity = (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle>Recent activity</CardTitle>
          <Button asChild variant='link' size='sm'>
            <Link href='/activity'>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No activity yet.</p>
          ) : (
            <ul className='divide-y'>
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className='flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between'
                >
                  <span>{entry.summary}</span>
                  <span className='text-xs text-muted-foreground'>
                    {entry.actor?.name ?? 'System'} ·{' '}
                    {dateTime.format(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  // Counts matter least, so they sit last and stay folded until opened.
  nodes.usage = (
    <details className='group rounded-lg border bg-card'>
      <summary className='flex min-h-9 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium'>
        <span>
          {TILE_TITLES.usage}
          <span className='ml-2 font-normal text-muted-foreground'>
            {PLAN_LABELS[ctx.planTier]} plan
          </span>
        </span>
        <ChevronDown className='size-4 transition-transform group-open:rotate-180' />
      </summary>
      <div className='grid gap-4 border-t p-4 sm:grid-cols-3'>
        {stats.map(({ label, value, limit, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className='rounded-md border p-3 transition-colors hover:border-border-strong'
          >
            <span className='flex items-center justify-between text-sm text-muted-foreground'>
              {label}
              <Icon className='size-4' />
            </span>
            <span className='block text-2xl font-semibold'>{value}</span>
            <span className='block text-xs text-muted-foreground'>
              of {formatLimit(limit)} on your plan
            </span>
          </Link>
        ))}
      </div>
    </details>
  )

  const tiles: DashboardTile[] = TILE_IDS.flatMap((id) =>
    nodes[id] ? [{ id, title: TILE_TITLES[id], node: nodes[id] }] : []
  )

  return (
    <div className='space-y-6'>
      <PageHeader
        title={`Welcome back, ${ctx.userName.split(' ')[0]}`}
        description={`${ctx.organisationName} · ${PLAN_LABELS[ctx.planTier]} plan`}
      />
      <DashboardGrid tiles={tiles} initial={saved} />
    </div>
  )
}
