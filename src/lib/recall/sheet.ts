import { notFound } from '@/lib/errors'
import { Feature, hasFeature } from '@/lib/plans'
import { loadSessionHeader } from '@/lib/sessions/header'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { recallLines } from './format'
import { getRecallSheet } from './service'

import type { RecallLine } from './format'
import type { OutboardView } from './service'

// The printable recall sheet (PLAN §4.7). Internal only: there is no share
// link for recall, so it carries notes freely.

export interface RecallPrintChannel {
  stripNumber: number
  label: string
  micName: string | null
  lines: RecallLine[]
  notes: string | null
}

export interface RecallPrintView {
  sessionName: string
  when: string
  roomName: string | null
  client: string | null
  consoleName: string
  organisationName: string
  branded: boolean
  channels: RecallPrintChannel[]
  outboard: OutboardView[]
  notes: string | null
}

export async function getRecallPrintView(
  ctx: TenantContext,
  sessionId: string
): Promise<RecallPrintView> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const sheet = await getRecallSheet(ctx, sessionId)
  if (!sheet) throw notFound('Recall sheet')
  const header = await loadSessionHeader(tenantDb(ctx), sessionId)
  if (!header) throw notFound('Session')
  return {
    sessionName: header.name,
    when: header.when,
    roomName: header.roomName,
    client: header.client,
    consoleName: sheet.consoleName,
    organisationName: ctx.organisationName,
    branded: !hasFeature(ctx.planTier, Feature.UNBRANDED_EXPORTS),
    channels: sheet.channels.map((c) => ({
      stripNumber: c.stripNumber,
      label: c.label,
      micName: c.micName,
      lines: recallLines(sheet.strip, c.values),
      notes: c.notes
    })),
    outboard: sheet.outboard,
    notes: sheet.notes
  }
}
