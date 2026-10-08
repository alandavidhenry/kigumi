import { Building2, DoorOpen, Users } from 'lucide-react'
import Link from 'next/link'

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
import { countMembers } from '@/lib/members'
import { PLAN_LABELS, formatLimit, getPlanLimits } from '@/lib/plans'
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
  const canSeeActivity = hasPermission(ctx.role, Permission.VIEW_AUDIT_LOG)
  const [usage, members, activity] = await Promise.all([
    getOrganisationUsage(ctx),
    countMembers(ctx),
    canSeeActivity ? listAuditLog(ctx, { limit: 8 }) : Promise.resolve([])
  ])
  const limits = getPlanLimits(ctx.planTier)

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

  return (
    <div className='space-y-6'>
      <PageHeader
        title={`Welcome back, ${ctx.userName.split(' ')[0]}`}
        description={`${ctx.organisationName} · ${PLAN_LABELS[ctx.planTier]} plan`}
      />

      <div className='grid gap-4 sm:grid-cols-3'>
        {stats.map(({ label, value, limit, icon: Icon, href }) => (
          <Link key={label} href={href} className='group'>
            <Card className='transition-colors group-hover:border-border-strong'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardDescription>{label}</CardDescription>
                <Icon className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <p className='text-2xl font-semibold'>{value}</p>
                <p className='text-xs text-muted-foreground'>
                  of {formatLimit(limit)} on your plan
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {usage.studios === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Add your first studio</CardTitle>
            <CardDescription>
              Studios hold your rooms. Room dimensions set the scale for layouts
              later on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href='/studios'>Go to studios</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Equipment inventory, the mic catalogue and your mic locker, AI mic
            recommendations, layouts and session sheets are on the way.
          </CardDescription>
        </CardHeader>
      </Card>

      {canSeeActivity && (
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
      )}
    </div>
  )
}
