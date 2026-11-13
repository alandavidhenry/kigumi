import { notFound } from 'next/navigation'

import { BreadcrumbLabel } from '@/components/mics/breadcrumb-label'
import { PageHeader } from '@/components/page-header'
import { SessionTabs } from '@/components/sessions/session-tabs'
import { Badge } from '@/components/ui/badge'
import { isAppError } from '@/lib/errors'
import { getSessionProgress } from '@/lib/sessions/progress'
import { getSession } from '@/lib/sessions/service'
import { formatSessionTime } from '@/lib/sessions/time'
import { SESSION_STATUS_LABELS } from '@/lib/sessions/types'
import { getTenantContext } from '@/lib/tenant-context'

import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  params: Promise<{ sessionId: string }>
}

// Segment layout for every page under /sessions/[sessionId]: the session header
// and the Overview / Layout / Inputs / Recall tabs.
export default async function SessionSegmentLayout({
  children,
  params
}: LayoutProps) {
  const { sessionId } = await params
  const ctx = await getTenantContext()

  let session
  let progress
  try {
    ;[session, progress] = await Promise.all([
      getSession(ctx, sessionId),
      getSessionProgress(ctx, sessionId)
    ])
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  return (
    <div className='space-y-4'>
      <BreadcrumbLabel
        href={`/sessions/${session.id}`}
        label={
          session.name.length > 40
            ? `${session.name.slice(0, 37)}…`
            : session.name
        }
      />
      <PageHeader
        title={
          <span className='flex items-center gap-2'>
            {session.name}
            <Badge variant='secondary'>
              {SESSION_STATUS_LABELS[session.status]}
            </Badge>
          </span>
        }
        description={`${formatSessionTime(
          new Date(session.startsAt),
          new Date(session.endsAt),
          session.timeZone
        )}${session.roomName ? ` · ${session.roomName}` : ''}`}
        backHref='/sessions'
        backLabel='Sessions'
      />
      <SessionTabs sessionId={session.id} progress={progress} />
      {children}
    </div>
  )
}
