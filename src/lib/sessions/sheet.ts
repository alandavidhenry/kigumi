import { notFound } from '@/lib/errors'
import { buildLayoutScene } from '@/lib/layout/scene'
import type { Scene } from '@/lib/layout/scene'
import { getLayout } from '@/lib/layout/service'
import { Feature, hasFeature } from '@/lib/plans'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { dawCsv, dawText, trackNames } from './daw-export'
import { loadSessionOverview } from './overview'
import { formatSessionTime } from './time'

import type { SessionOverview } from './overview'

// The printable / shareable view of a session (PLAN §4.6). One shape serves
// the PDF and the public share page. The share projection (`internal: false`)
// is deliberately thin: no ids, serials, notes or client name, and another
// session's name never appears (ADR 0016 decision 7).

export interface SharedChannel {
  number: number
  kind: string
  source: string
  mic: string | null
  stand: string | null
  preampInput: string | null
  phantom: boolean
  padDb: number | null
  // Internal sheets only.
  notes: string | null
}

export interface SharedSessionView {
  name: string
  when: string
  timeZone: string
  roomName: string | null
  organisationName: string
  // Free plans show "Planned with Kigumi"; Pro and above can drop it.
  branded: boolean
  scene: Scene | null
  channels: SharedChannel[]
  warnings: Array<{ severity: 'warning' | 'blocking'; text: string }>
  channelNames: Array<{ number: number; name: string }>
  // Internal sheets only.
  client: string | null
  notes: string | null
}

export function buildSheetView(
  overview: SessionOverview,
  organisation: { name: string; planTier: unknown },
  internal: boolean
): SharedSessionView {
  return {
    name: overview.name,
    when: formatSessionTime(
      overview.startsAt,
      overview.endsAt,
      overview.timeZone
    ),
    timeZone: overview.timeZone,
    roomName: overview.roomName,
    organisationName: organisation.name,
    branded: !hasFeature(organisation.planTier, Feature.UNBRANDED_EXPORTS),
    scene: overview.layout ? buildLayoutScene(overview.layout) : null,
    channels: overview.channels.map((c) => ({
      number: c.number,
      kind: c.kind,
      source: c.source,
      mic: c.micUnitId ? (overview.units.get(c.micUnitId)?.name ?? null) : null,
      stand: c.stand,
      preampInput: c.preampInput,
      phantom: c.phantom,
      padDb: c.padDb,
      notes: internal ? c.notes : null
    })),
    warnings: overview.warnings.map((w) => ({
      severity: w.severity,
      text:
        !internal && w.code === 'double_booked'
          ? 'A microphone on this list is also booked in another session at the same time.'
          : w.text
    })),
    channelNames: trackNames(overview.channels),
    client: internal ? overview.client : null,
    notes: internal ? overview.notes : null
  }
}

// The signed-in team's own printable sheet.
export async function getSessionSheet(
  ctx: TenantContext,
  sessionId: string
): Promise<SharedSessionView> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const overview = await loadSessionOverview(tenantDb(ctx), sessionId)
  if (!overview) throw notFound('Session')
  return buildSheetView(
    overview,
    { name: ctx.organisationName, planTier: ctx.planTier },
    true
  )
}

export interface LayoutSheet {
  name: string
  organisationName: string
  branded: boolean
  scene: Scene
}

export async function getLayoutSheet(
  ctx: TenantContext,
  layoutId: string
): Promise<LayoutSheet> {
  const layout = await getLayout(ctx, layoutId)
  return {
    name: layout.name,
    organisationName: ctx.organisationName,
    branded: !hasFeature(ctx.planTier, Feature.UNBRANDED_EXPORTS),
    scene: buildLayoutScene(layout)
  }
}

export type DawFormat = 'csv' | 'txt'

export async function getDawExport(
  ctx: TenantContext,
  sessionId: string,
  format: DawFormat
): Promise<{ body: string; contentType: string; fileName: string }> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const db = tenantDb(ctx)
  const session = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: { name: true }
  })
  if (!session) throw notFound('Session')
  const channels = await db.inputChannel.findMany({
    where: { sessionId },
    orderBy: { number: 'asc' },
    select: { number: true, source: true, dawName: true }
  })
  const base =
    session.name
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'session'
  return format === 'csv'
    ? {
        body: dawCsv(channels),
        contentType: 'text/csv; charset=utf-8',
        fileName: `${base}-tracks.csv`
      }
    : {
        body: dawText(channels),
        contentType: 'text/plain; charset=utf-8',
        fileName: `${base}-tracks.txt`
      }
}
