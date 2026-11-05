import { randomUUID } from 'node:crypto'

import { deleteAttachmentsFor } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import { badRequest, conflict, notFound } from '@/lib/errors'
import {
  channelSelect,
  loadUnitInfos,
  toChannelRow
} from '@/lib/sessions/queries'
import type { Db } from '@/lib/sessions/queries'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { readStrip } from './consoles'
import { prefillChannels } from './prefill'
import {
  outboardInputSchema,
  outboardUpdateSchema,
  recallChannelUpdateSchema,
  recallCreateSchema,
  recallSheetUpdateSchema,
  validateValues,
  valuesSchema
} from './schemas'
import { MAX_OUTBOARD_UNITS } from './types'

import type { OutboardSetting, RecallValues, StripDefinition } from './types'

// Per-session recall sheets (PLAN §4.7, ADR 0017). One sheet per session,
// holding a snapshot of the desk's channel strip so it never changes under a
// session that has already been recalled.

export interface RecallChannelView {
  id: string
  stripNumber: number
  label: string
  micName: string | null
  values: RecallValues
  notes: string | null
}

export interface OutboardView {
  id: string
  name: string
  equipmentItemId: string | null
  insertOn: string | null
  settings: OutboardSetting[]
  notes: string | null
}

export interface RecallPhotoView {
  id: string
  fileName: string
}

export interface RecallSheetView {
  id: string
  sessionId: string
  consoleId: string | null
  consoleName: string
  channelCount: number
  strip: StripDefinition
  notes: string | null
  channels: RecallChannelView[]
  outboard: OutboardView[]
  photos: RecallPhotoView[]
}

function readValues(json: unknown): RecallValues {
  const parsed = valuesSchema.safeParse(json)
  return parsed.success ? parsed.data : {}
}

function readSettings(json: unknown): OutboardSetting[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((entry) => {
    const row = entry as Partial<OutboardSetting> | null
    return row && typeof row.label === 'string' && typeof row.value === 'string'
      ? [{ label: row.label, value: row.value }]
      : []
  })
}

async function assertSession(db: Db, sessionId: string) {
  const session = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: { id: true, name: true }
  })
  if (!session) throw notFound('Session')
  return session
}

async function requireSheet(db: Db, sessionId: string) {
  await assertSession(db, sessionId)
  const sheet = await db.recallSheet.findFirst({
    where: { sessionId },
    select: { id: true, strip: true }
  })
  if (!sheet) throw notFound('Recall sheet')
  return { id: sheet.id, strip: readStrip(sheet.strip) }
}

// ---------------------------------------------------------------------------
// Read

export async function getRecallSheet(
  ctx: TenantContext,
  sessionId: string
): Promise<RecallSheetView | null> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const db = tenantDb(ctx)
  await assertSession(db, sessionId)
  const sheet = await db.recallSheet.findFirst({
    where: { sessionId },
    select: {
      id: true,
      consoleId: true,
      consoleName: true,
      channelCount: true,
      strip: true,
      notes: true,
      channels: {
        orderBy: { stripNumber: 'asc' },
        select: {
          id: true,
          stripNumber: true,
          label: true,
          micName: true,
          values: true,
          notes: true
        }
      },
      outboard: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          equipmentItemId: true,
          insertOn: true,
          settings: true,
          notes: true
        }
      }
    }
  })
  if (!sheet) return null
  const photos = await db.attachment.findMany({
    where: { entityType: 'recall_sheet', entityId: sheet.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true }
  })
  return {
    id: sheet.id,
    sessionId,
    consoleId: sheet.consoleId,
    consoleName: sheet.consoleName,
    channelCount: sheet.channelCount,
    strip: readStrip(sheet.strip),
    notes: sheet.notes,
    channels: sheet.channels.map((c) => ({
      ...c,
      values: readValues(c.values)
    })),
    outboard: sheet.outboard.map((o) => ({
      ...o,
      settings: readSettings(o.settings)
    })),
    photos
  }
}

// ---------------------------------------------------------------------------
// Create

async function loadPrefillInputs(db: Db, sessionId: string) {
  const channels = (
    await db.inputChannel.findMany({
      where: { sessionId },
      orderBy: { number: 'asc' },
      select: channelSelect
    })
  ).map(toChannelRow)
  const units = await loadUnitInfos(
    db,
    channels.map((c) => c.micUnitId)
  )
  return channels.map((c) => ({
    id: c.id,
    number: c.number,
    source: c.source,
    micName: c.micUnitId ? (units.get(c.micUnitId)?.name ?? null) : null,
    phantom: c.phantom,
    padDb: c.padDb,
    preampInput: c.preampInput
  }))
}

export interface CreateRecallResult {
  id: string
  // Inputs numbered above the desk's channel count, left off the sheet.
  skipped: number
}

export async function createRecallSheet(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<CreateRecallResult> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = recallCreateSchema.parse(input)
  const db = tenantDb(ctx)
  const session = await assertSession(db, sessionId)
  if (await db.recallSheet.count({ where: { sessionId } })) {
    throw conflict('This session already has a recall sheet')
  }

  const id = randomUUID()
  let skipped = 0

  if (data.fromSessionId) {
    // Duplicate a previous session's recall: its desk, strip, values and
    // outboard, exactly as recorded. Photos are not copied.
    if (data.fromSessionId === sessionId) {
      throw badRequest('Choose a different session to copy from')
    }
    const source = await db.recallSheet.findFirst({
      where: { sessionId: data.fromSessionId },
      select: {
        consoleId: true,
        consoleName: true,
        channelCount: true,
        strip: true,
        notes: true,
        channels: {
          select: {
            stripNumber: true,
            label: true,
            micName: true,
            values: true,
            notes: true
          }
        },
        outboard: {
          select: {
            equipmentItemId: true,
            name: true,
            insertOn: true,
            settings: true,
            notes: true,
            sortOrder: true
          }
        }
      }
    })
    if (!source) throw notFound('Recall sheet')

    await db.$transaction(async (tx) => {
      await tx.recallSheet.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          sessionId,
          consoleId: source.consoleId,
          consoleName: source.consoleName,
          channelCount: source.channelCount,
          strip: source.strip as never,
          notes: source.notes,
          createdById: ctx.userId
        }
      })
      if (source.channels.length > 0) {
        await tx.recallChannel.createMany({
          data: source.channels.map((c) => ({
            id: randomUUID(),
            organisationId: ctx.organisationId,
            recallSheetId: id,
            stripNumber: c.stripNumber,
            inputChannelId: null,
            label: c.label,
            micName: c.micName,
            values: (c.values ?? {}) as never,
            notes: c.notes
          }))
        })
      }
      if (source.outboard.length > 0) {
        await tx.outboardRecall.createMany({
          data: source.outboard.map((o) => ({
            id: randomUUID(),
            organisationId: ctx.organisationId,
            recallSheetId: id,
            equipmentItemId: o.equipmentItemId,
            name: o.name,
            insertOn: o.insertOn,
            settings: (o.settings ?? []) as never,
            notes: o.notes,
            sortOrder: o.sortOrder
          }))
        })
      }
    })
  } else {
    if (!data.consoleId) throw badRequest('Choose a console')
    const desk = await db.console.findFirst({
      where: { id: data.consoleId },
      select: {
        id: true,
        name: true,
        channelCount: true,
        template: { select: { strip: true } }
      }
    })
    if (!desk) throw notFound('Console')
    const strip = readStrip(desk.template.strip)
    const inputs = await loadPrefillInputs(db, sessionId)
    const filled = prefillChannels(strip, desk.channelCount, inputs)
    skipped = filled.skipped.length

    await db.$transaction(async (tx) => {
      await tx.recallSheet.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          sessionId,
          consoleId: desk.id,
          consoleName: desk.name,
          channelCount: desk.channelCount,
          strip: strip as never,
          createdById: ctx.userId
        }
      })
      if (filled.channels.length > 0) {
        await tx.recallChannel.createMany({
          data: filled.channels.map((c) => ({
            id: randomUUID(),
            organisationId: ctx.organisationId,
            recallSheetId: id,
            stripNumber: c.stripNumber,
            inputChannelId: c.inputChannelId,
            label: c.label,
            micName: c.micName,
            values: c.values as never,
            notes: c.notes
          }))
        })
      }
    })
  }

  await recordAudit(ctx, {
    action: 'recall.create',
    entityType: 'session',
    entityId: sessionId,
    summary: `Created the recall sheet for ${session.name}`,
    metadata: { copiedFrom: data.fromSessionId ?? null, skipped }
  })
  return { id, skipped }
}

// Adds a strip for every input that has none yet; never changes or removes
// anything already written down.
export async function addMissingRecallChannels(
  ctx: TenantContext,
  sessionId: string
): Promise<{ added: number; skipped: number }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  const existing = await db.recallChannel.findMany({
    where: { recallSheetId: sheet.id },
    select: { stripNumber: true }
  })
  const taken = new Set(existing.map((c) => c.stripNumber))
  const desk = await db.recallSheet.findFirst({
    where: { id: sheet.id },
    select: { channelCount: true }
  })
  const inputs = await loadPrefillInputs(db, sessionId)
  const filled = prefillChannels(sheet.strip, desk?.channelCount ?? 0, inputs)
  const fresh = filled.channels.filter((c) => !taken.has(c.stripNumber))
  if (fresh.length > 0) {
    await db.recallChannel.createMany({
      data: fresh.map((c) => ({
        id: randomUUID(),
        organisationId: ctx.organisationId,
        recallSheetId: sheet.id,
        stripNumber: c.stripNumber,
        inputChannelId: c.inputChannelId,
        label: c.label,
        micName: c.micName,
        values: c.values as never,
        notes: c.notes
      }))
    })
    await recordAudit(ctx, {
      action: 'recall.sync',
      entityType: 'session',
      entityId: sessionId,
      summary: `Added ${fresh.length} strip${fresh.length === 1 ? '' : 's'} from the input list`
    })
  }
  return { added: fresh.length, skipped: filled.skipped.length }
}

// ---------------------------------------------------------------------------
// Update and delete

export async function updateRecallSheet(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = recallSheetUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  await db.recallSheet.updateMany({
    where: { id: sheet.id },
    data: { ...(data.notes !== undefined && { notes: data.notes }) }
  })
  await recordAudit(ctx, {
    action: 'recall.update',
    entityType: 'session',
    entityId: sessionId,
    summary: 'Updated the recall sheet notes'
  })
}

export async function updateRecallChannel(
  ctx: TenantContext,
  sessionId: string,
  channelId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = recallChannelUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)

  const channel = await db.recallChannel.findFirst({
    where: { id: channelId, recallSheetId: sheet.id },
    select: { stripNumber: true }
  })
  if (!channel) throw notFound('Recall channel')

  if (data.values) {
    const problem = validateValues(sheet.strip, data.values)
    if (problem) throw badRequest(problem)
  }
  await db.recallChannel.updateMany({
    where: { id: channelId, recallSheetId: sheet.id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.values !== undefined && { values: data.values }),
      ...(data.notes !== undefined && { notes: data.notes })
    }
  })
  await recordAudit(ctx, {
    action: 'recall.channel_update',
    entityType: 'session',
    entityId: sessionId,
    summary: `Updated recall for strip ${channel.stripNumber}`,
    metadata: { fields: Object.keys(data) }
  })
}

export async function deleteRecallSheet(
  ctx: TenantContext,
  sessionId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  await deleteAttachmentsFor(ctx, 'recall_sheet', sheet.id)
  await db.recallSheet.deleteMany({ where: { id: sheet.id } })
  await recordAudit(ctx, {
    action: 'recall.delete',
    entityType: 'session',
    entityId: sessionId,
    summary: 'Deleted the recall sheet'
  })
}

// ---------------------------------------------------------------------------
// Outboard

async function assertOwnedItem(
  db: Db,
  equipmentItemId: string | null | undefined
) {
  if (!equipmentItemId) return
  const item = await db.equipmentItem.findFirst({
    where: { id: equipmentItemId },
    select: { id: true }
  })
  if (!item) throw notFound('Equipment')
}

export async function createOutboard(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<{ id: string }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = outboardInputSchema.parse(input)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  await assertOwnedItem(db, data.equipmentItemId)

  const count = await db.outboardRecall.count({
    where: { recallSheetId: sheet.id }
  })
  if (count >= MAX_OUTBOARD_UNITS) {
    throw badRequest(`At most ${MAX_OUTBOARD_UNITS} outboard units per sheet`)
  }
  const created = await db.outboardRecall.create({
    data: {
      organisationId: ctx.organisationId,
      recallSheetId: sheet.id,
      equipmentItemId: data.equipmentItemId ?? null,
      name: data.name,
      insertOn: data.insertOn ?? null,
      settings: data.settings,
      notes: data.notes ?? null,
      sortOrder: count
    },
    select: { id: true }
  })
  await recordAudit(ctx, {
    action: 'recall.outboard_add',
    entityType: 'session',
    entityId: sessionId,
    summary: `Added outboard recall for ${data.name}`
  })
  return created
}

export async function updateOutboard(
  ctx: TenantContext,
  sessionId: string,
  outboardId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = outboardUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  const existing = await db.outboardRecall.findFirst({
    where: { id: outboardId, recallSheetId: sheet.id },
    select: { name: true }
  })
  if (!existing) throw notFound('Outboard recall')
  await assertOwnedItem(db, data.equipmentItemId)

  await db.outboardRecall.updateMany({
    where: { id: outboardId, recallSheetId: sheet.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.equipmentItemId !== undefined && {
        equipmentItemId: data.equipmentItemId
      }),
      ...(data.insertOn !== undefined && { insertOn: data.insertOn }),
      ...(data.settings !== undefined && { settings: data.settings }),
      ...(data.notes !== undefined && { notes: data.notes })
    }
  })
  await recordAudit(ctx, {
    action: 'recall.outboard_update',
    entityType: 'session',
    entityId: sessionId,
    summary: `Updated outboard recall for ${data.name ?? existing.name}`,
    metadata: { fields: Object.keys(data) }
  })
}

export async function deleteOutboard(
  ctx: TenantContext,
  sessionId: string,
  outboardId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const sheet = await requireSheet(db, sessionId)
  const existing = await db.outboardRecall.findFirst({
    where: { id: outboardId, recallSheetId: sheet.id },
    select: { name: true }
  })
  if (!existing) throw notFound('Outboard recall')
  await db.outboardRecall.deleteMany({
    where: { id: outboardId, recallSheetId: sheet.id }
  })
  await recordAudit(ctx, {
    action: 'recall.outboard_remove',
    entityType: 'session',
    entityId: sessionId,
    summary: `Removed outboard recall for ${existing.name}`
  })
}

// Exposed so the photo service finds the sheet the same way.
export { requireSheet as requireRecallSheet }

export interface RecallSource {
  sessionId: string
  name: string
  // UTC date, enough to tell sessions of the same name apart.
  date: string
}

// Sessions that already have a recall sheet, most recent first: the choices
// for "copy a previous session's recall".
export async function listRecallSources(
  ctx: TenantContext,
  excludeSessionId?: string
): Promise<RecallSource[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const rows = await tenantDb(ctx).recallSheet.findMany({
    where: excludeSessionId ? { sessionId: { not: excludeSessionId } } : {},
    orderBy: { session: { startsAt: 'desc' } },
    take: 50,
    select: { session: { select: { id: true, name: true, startsAt: true } } }
  })
  return rows.map(({ session }) => ({
    sessionId: session.id,
    name: session.name,
    date: session.startsAt.toISOString().slice(0, 10)
  }))
}
