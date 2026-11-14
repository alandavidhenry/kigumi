import { notFound } from 'next/navigation'

import { RecommendationWorkbench } from '@/components/recommendations/recommendation-workbench'
import { InputListTable } from '@/components/sessions/input-list-table'
import { WarningsPanel } from '@/components/sessions/warnings-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAiUsage } from '@/lib/ai/usage'
import { listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { listLocker } from '@/lib/mics/locker'
import { listEditorUnits } from '@/lib/sessions/editor-data'
import { getSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Inputs and mics' }

interface PageProps {
  params: Promise<{ sessionId: string }>
}

export default async function SessionInputsPage({ params }: PageProps) {
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
  const canGenerate = hasPermission(ctx.role, Permission.USE_AI)
  const [units, rooms, locker, usage] = await Promise.all([
    listEditorUnits(ctx),
    canEdit ? listRoomOptions(ctx) : [],
    canEdit ? listLocker(ctx) : [],
    canGenerate ? getAiUsage(ctx) : null
  ])
  const flagged = new Set(session.warnings.flatMap((w) => w.channelIds))

  return (
    <div className='space-y-8'>
      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <WarningsPanel warnings={session.warnings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Input list{' '}
            <span className='font-normal text-muted-foreground'>
              ({session.channels.length}
              {session.channelsAvailable
                ? ` of ${session.channelsAvailable}`
                : ''}
              )
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InputListTable
            sessionId={session.id}
            channels={session.channels}
            units={units}
            canEdit={canEdit}
            channelIdsWithWarnings={flagged}
          />
        </CardContent>
      </Card>

      {canEdit && (
        <section className='space-y-3' aria-labelledby='recs-heading'>
          <h2 id='recs-heading' className='text-base font-semibold'>
            Mic recommendations
          </h2>
          <RecommendationWorkbench
            rooms={rooms}
            canGenerate={canGenerate}
            allowance={
              usage ? { remaining: usage.remaining, limit: usage.limit } : null
            }
            lockerSize={locker.length}
            session={{
              id: session.id,
              name: session.name,
              roomId: session.roomId,
              channels: session.channelsAvailable,
              sources: session.channels
                .filter((c) => c.kind !== 'line')
                .map((c) => c.source)
            }}
          />
        </section>
      )}
    </div>
  )
}
