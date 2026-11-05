import { DEFAULT_TIMEZONE } from './overview'
import { formatSessionTime } from './time'

import type { Db } from './queries'

// The few session fields a printed page needs, without loading the layout and
// input list the way loadSessionOverview does.
export interface SessionHeader {
  name: string
  when: string
  roomName: string | null
  client: string | null
}

export async function loadSessionHeader(
  db: Db,
  sessionId: string
): Promise<SessionHeader | null> {
  const session = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: {
      name: true,
      client: true,
      startsAt: true,
      endsAt: true,
      room: { select: { name: true, studio: { select: { timezone: true } } } }
    }
  })
  if (!session) return null
  return {
    name: session.name,
    client: session.client,
    roomName: session.room?.name ?? null,
    when: formatSessionTime(
      session.startsAt,
      session.endsAt,
      session.room?.studio.timezone ?? DEFAULT_TIMEZONE
    )
  }
}
