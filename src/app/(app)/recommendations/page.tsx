import { History } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/page-header'
import { RecommendationWorkbench } from '@/components/recommendations/recommendation-workbench'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAiUsage } from '@/lib/ai/usage'
import { listRoomOptions } from '@/lib/equipment'
import { isAppError } from '@/lib/errors'
import { listLocker } from '@/lib/mics/locker'
import { listRecommendations } from '@/lib/recommendations/service'
import { getSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Mic recommendations' }

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

interface PageProps {
  searchParams: Promise<{ sessionId?: string }>
}

export default async function RecommendationsPage({ searchParams }: PageProps) {
  const { sessionId } = await searchParams
  const ctx = await getTenantContext()
  const canGenerate = hasPermission(ctx.role, Permission.USE_AI)
  const [rooms, locker, history, usage] = await Promise.all([
    listRoomOptions(ctx),
    listLocker(ctx),
    listRecommendations(ctx, 10),
    canGenerate ? getAiUsage(ctx) : null
  ])

  // Planning for a session: use its room, channel count and current inputs. A
  // session that isn't ours (or doesn't exist) is simply ignored.
  let session = null
  if (sessionId) {
    try {
      const detail = await getSession(ctx, sessionId)
      session = {
        id: detail.id,
        name: detail.name,
        roomId: detail.roomId,
        channels: detail.channelsAvailable,
        sources: detail.channels
          .filter((c) => c.kind !== 'line')
          .map((c) => c.source)
      }
    } catch (error) {
      if (!isAppError(error) || error.status !== 404) throw error
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Mic recommendations'
        description='Which of the microphones you own suit each source? The check is free and uses only your locker; the AI can then rank the options and explain its choice.'
      />

      <RecommendationWorkbench
        rooms={rooms}
        canGenerate={canGenerate}
        allowance={
          usage ? { remaining: usage.remaining, limit: usage.limit } : null
        }
        lockerSize={locker.length}
        session={session}
      />

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <History className='h-4 w-4' aria-hidden='true' />
              Earlier recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='divide-y'>
              {history.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/recommendations/${item.id}`}
                    className='flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:underline'
                  >
                    <span className='truncate font-medium'>{item.title}</span>
                    <span className='text-xs text-muted-foreground'>
                      {date.format(new Date(item.createdAt))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
