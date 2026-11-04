import { isInsideRoom } from '@/lib/layout/geometry'
import type { LayoutDoc } from '@/lib/layout/types'
import type { PhantomMode } from '@/lib/recommendations/types'

import {
  channelSelect,
  layoutSelect,
  loadBookings,
  loadUnitInfos,
  toChannelRow,
  toLayoutDoc
} from './queries'
import { formatLocalInput } from './time'
import { sessionWarnings } from './warnings'

import type { Db } from './queries'
import type { ChannelRow, SessionStatus, UnitInfo } from './types'
import type { SessionWarning } from './warnings'

export const DEFAULT_TIMEZONE = 'Europe/London'

export interface SessionOverview {
  id: string
  name: string
  client: string | null
  notes: string | null
  status: SessionStatus
  startsAt: Date
  endsAt: Date
  startsLocal: string
  endsLocal: string
  timeZone: string
  roomId: string | null
  roomName: string | null
  organisationId: string
  channelsAvailable: number | null
  phantomMode: PhantomMode
  layout: LayoutDoc | null
  channels: ChannelRow[]
  units: Map<string, UnitInfo>
  warnings: SessionWarning[]
}

// Everything the session page, the PDF and the share view need, read through
// a tenant-scoped client. Returns null when the session isn't in this
// organisation.
export async function loadSessionOverview(
  db: Db,
  sessionId: string
): Promise<SessionOverview | null> {
  const session = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: {
      id: true,
      organisationId: true,
      name: true,
      client: true,
      notes: true,
      status: true,
      startsAt: true,
      endsAt: true,
      roomId: true,
      channelsAvailable: true,
      phantomMode: true,
      room: {
        select: { name: true, studio: { select: { timezone: true } } }
      }
    }
  })
  if (!session) return null

  const [layoutRow, channelRows] = await Promise.all([
    db.layout.findFirst({
      where: { sessionId },
      select: layoutSelect
    }),
    db.inputChannel.findMany({
      where: { sessionId },
      orderBy: { number: 'asc' },
      select: channelSelect
    })
  ])
  const layout = layoutRow ? toLayoutDoc(layoutRow) : null
  const channels = channelRows.map(toChannelRow)

  const units = await loadUnitInfos(db, [
    ...channels.map((c) => c.micUnitId),
    ...(layout?.items.map((i) => i.micUnitId) ?? [])
  ])
  const bookings = await loadBookings(
    db,
    { start: session.startsAt, end: session.endsAt },
    sessionId
  )

  const channelByItem = new Map(
    channels.filter((c) => c.layoutItemId).map((c) => [c.layoutItemId, c])
  )
  const warnings = sessionWarnings({
    phantomMode: session.phantomMode as PhantomMode,
    channelsAvailable: session.channelsAvailable,
    channels,
    units,
    bookings,
    micItemsWithoutUnit: (layout?.items ?? [])
      .filter((i) => i.type === 'mic' && !i.micUnitId)
      .map((i) => ({
        channelId: channelByItem.get(i.id)?.id ?? null,
        label: i.label ?? 'A microphone'
      })),
    itemsOutsideRoom: layout
      ? layout.items
          .filter((i) => !isInsideRoom(i, layout))
          .map((i) => ({ label: i.label ?? 'An item' }))
      : []
  })

  const timeZone = session.room?.studio.timezone ?? DEFAULT_TIMEZONE
  return {
    id: session.id,
    organisationId: session.organisationId,
    name: session.name,
    client: session.client,
    notes: session.notes,
    status: session.status as SessionStatus,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    startsLocal: formatLocalInput(session.startsAt, timeZone),
    endsLocal: formatLocalInput(session.endsAt, timeZone),
    timeZone,
    roomId: session.roomId,
    roomName: session.room?.name ?? null,
    channelsAvailable: session.channelsAvailable,
    phantomMode: session.phantomMode as PhantomMode,
    layout,
    channels,
    units,
    warnings
  }
}
