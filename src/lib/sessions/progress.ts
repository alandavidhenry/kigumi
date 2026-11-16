import { notFound } from '@/lib/errors'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

export interface SessionProgress {
  layout: boolean
  inputs: boolean
  recall: boolean
  counts: {
    items: number
    micChannels: number
    unassignedMics: number
    channels: number
  }
}

// Which planning steps of a session are done, for the tab ticks.
export async function getSessionProgress(
  ctx: TenantContext,
  sessionId: string
): Promise<SessionProgress> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const db = tenantDb(ctx)
  const session = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: { id: true }
  })
  if (!session) throw notFound('Session')

  const [items, channels, recall] = await Promise.all([
    db.layoutItem.count({ where: { layout: { sessionId } } }),
    db.inputChannel.findMany({
      where: { sessionId },
      select: { kind: true, micUnitId: true }
    }),
    db.recallSheet.findFirst({ where: { sessionId }, select: { id: true } })
  ])
  const mics = channels.filter((c) => c.kind === 'mic')
  const unassignedMics = mics.filter((c) => !c.micUnitId).length
  return {
    layout: items > 0,
    inputs: channels.length > 0 && unassignedMics === 0,
    recall: recall !== null,
    counts: {
      items,
      micChannels: mics.length,
      unassignedMics,
      channels: channels.length
    }
  }
}
