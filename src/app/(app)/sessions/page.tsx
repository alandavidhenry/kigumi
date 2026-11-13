import { CalendarClock, Plus } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { NewSessionDialog } from '@/components/sessions/new-session-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { listRoomOptions } from '@/lib/equipment'
import { listTemplates } from '@/lib/layout/service'
import { Feature, hasFeature } from '@/lib/plans'
import { listSessions } from '@/lib/sessions/service'
import { formatSessionTime } from '@/lib/sessions/time'
import { SESSION_STATUS_LABELS } from '@/lib/sessions/types'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Sessions' }

const SCOPES = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' }
] as const

interface PageProps {
  searchParams: Promise<{ scope?: string }>
}

export default async function SessionsPage({ searchParams }: PageProps) {
  const { scope: rawScope } = await searchParams
  const scope = SCOPES.find((s) => s.id === rawScope)?.id ?? 'upcoming'
  const ctx = await getTenantContext()
  const canManage = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)
  const canTemplates = hasFeature(ctx.planTier, Feature.TEMPLATES)

  const [sessions, recent, rooms, templates] = await Promise.all([
    listSessions(ctx, { scope }),
    canManage ? listSessions(ctx, { scope: 'all' }) : [],
    canManage ? listRoomOptions(ctx) : [],
    canManage && canTemplates ? listTemplates(ctx) : []
  ])

  const newButton = canManage ? (
    <NewSessionDialog
      rooms={rooms}
      ownTemplates={templates.map((t) => ({ id: t.id, name: t.name }))}
      ownTemplatesLocked={!canTemplates}
      sessions={recent.slice(0, 30).map((s) => ({ id: s.id, name: s.name }))}
      trigger={
        <Button variant='surface'>
          <Plus />
          New session
        </Button>
      }
    />
  ) : null

  const actions = canManage ? (
    <div className='flex flex-wrap gap-2'>
      <Button asChild>
        <Link href='/sessions/new'>
          <CalendarClock />
          Plan a session
        </Link>
      </Button>
      {newButton}
    </div>
  ) : null

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Sessions'
        description='Plan a session once: the room layout, the microphones and the input list stay in step.'
        actions={actions}
      />

      <nav aria-label='Session filter' className='flex gap-1'>
        {SCOPES.map((s) => (
          <Button
            key={s.id}
            asChild
            size='sm'
            variant={s.id === scope ? 'secondary' : 'ghost'}
          >
            <Link
              href={`/sessions?scope=${s.id}`}
              aria-current={s.id === scope ? 'page' : undefined}
            >
              {s.label}
            </Link>
          </Button>
        ))}
      </nav>

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={scope === 'past' ? 'No past sessions' : 'No sessions yet'}
            description={
              canManage
                ? 'Create a session to lay out the room and build the input list.'
                : 'Nobody has planned a session yet.'
            }
            action={actions}
          />
        </Card>
      ) : (
        <Card className='divide-y overflow-hidden p-0'>
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className='flex min-h-14 flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>{session.name}</p>
                <p className='truncate text-xs text-muted-foreground'>
                  {formatSessionTime(
                    new Date(session.startsAt),
                    new Date(session.endsAt),
                    session.timeZone
                  )}
                  {session.roomName && ` · ${session.roomName}`}
                  {session.client && ` · ${session.client}`}
                </p>
              </div>
              <span className='text-xs text-muted-foreground'>
                {session.channelCount} input
                {session.channelCount === 1 ? '' : 's'}
              </span>
              <Badge
                variant={
                  session.status === 'cancelled'
                    ? 'destructive'
                    : session.status === 'confirmed'
                      ? 'success'
                      : 'secondary'
                }
              >
                {SESSION_STATUS_LABELS[session.status]}
              </Badge>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
