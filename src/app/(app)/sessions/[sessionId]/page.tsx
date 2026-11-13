import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SceneSvg } from '@/components/layout/scene-svg'
import { SessionActions } from '@/components/sessions/session-actions'
import { SessionDetailsForm } from '@/components/sessions/session-details-form'
import { WarningsPanel } from '@/components/sessions/warnings-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { buildLayoutScene } from '@/lib/layout/scene'
import { Feature, hasFeature } from '@/lib/plans'
import { listRecommendations } from '@/lib/recommendations/service'
import { getSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Session' }

interface PageProps {
  params: Promise<{ sessionId: string }>
}

export default async function SessionPage({ params }: PageProps) {
  const { sessionId } = await params
  const ctx = await getTenantContext()

  let session
  try {
    session = await getSession(ctx, sessionId)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }

  const canEdit = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)
  const [rooms, recommendations] = await Promise.all([
    canEdit ? listRoomOptions(ctx) : [],
    canEdit ? listRecommendations(ctx, 20) : []
  ])
  const flagged = new Set(session.warnings.flatMap((w) => w.channelIds))
  const blocking = session.warnings.filter((w) => w.severity === 'blocking')

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            Checks
            {blocking.length > 0 && (
              <Badge variant='destructive'>
                {blocking.length} problem{blocking.length === 1 ? '' : 's'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WarningsPanel warnings={session.warnings} />
        </CardContent>
      </Card>

      <div className='grid gap-6 lg:grid-cols-[1fr_1fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Layout</CardTitle>
          </CardHeader>
          <CardContent>
            {session.layout ? (
              <SceneSvg scene={buildLayoutScene(session.layout)} />
            ) : (
              <p className='text-sm text-muted-foreground'>No layout yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionDetailsForm
              sessionId={session.id}
              canEdit={canEdit}
              rooms={rooms}
              values={{
                name: session.name,
                client: session.client,
                roomId: session.roomId,
                startsLocal: session.startsLocal,
                endsLocal: session.endsLocal,
                status: session.status,
                channelsAvailable: session.channelsAvailable,
                phantomMode: session.phantomMode,
                notes: session.notes,
                timeZone: session.timeZone
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Input list</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3'>
          <p className='text-sm text-muted-foreground'>
            {session.channels.length}
            {session.channelsAvailable
              ? ` of ${session.channelsAvailable}`
              : ''}{' '}
            input{session.channels.length === 1 ? '' : 's'}
            {flagged.size > 0 ? `, ${flagged.size} with warnings` : ''}.
          </p>
          <Button asChild variant='surface'>
            <Link href={`/sessions/${session.id}/inputs`}>
              Open inputs &amp; mics
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Share and export</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionActions
            sessionId={session.id}
            canEdit={canEdit}
            canUseTemplates={hasFeature(ctx.planTier, Feature.TEMPLATES)}
            share={session.share}
            recommendations={recommendations.map((r) => ({
              id: r.id,
              title: r.title
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
