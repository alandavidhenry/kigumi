import { randomUUID } from 'node:crypto'

import { deleteAttachmentsFor } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import { badRequest, notFound, planLimit } from '@/lib/errors'
import { assertOwnedRefs } from '@/lib/layout/service'
import { getBuiltInTemplate, placeTemplate } from '@/lib/layout/templates'
import { Feature } from '@/lib/plans'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission, hasPermission } from '@/types/rbac'

import { defaultPhantom, nextChannelNumber } from './input-list'
import { DEFAULT_TIMEZONE, loadSessionOverview } from './overview'
import { itemSelect, loadUnitInfos } from './queries'
import {
  channelInputSchema,
  channelOrderSchema,
  channelUpdateSchema,
  sessionInputSchema,
  sessionListSchema,
  sessionUpdateSchema
} from './schemas'
import { syncInputList } from './sync'
import { formatLocalInput, localToUtc } from './time'
import { MAX_CHANNELS } from './types'

import type { SessionOverview } from './overview'
import type { StartFrom } from './schemas'
import type { SessionStatus } from './types'

// Sessions, their layouts and their input lists (PLAN §4.6, ADR 0016).

const DEFAULT_ROOM = { widthMm: 6000, lengthMm: 5000, heightMm: null }

export interface SessionSummary {
  id: string
  name: string
  client: string | null
  status: SessionStatus
  startsAt: string
  endsAt: string
  startsLocal: string
  timeZone: string
  roomName: string | null
  channelCount: number
}

export interface ShareInfo {
  token: string
  expiresAt: string | null
}

export interface SessionDetail extends Omit<
  SessionOverview,
  'startsAt' | 'endsAt' | 'units'
> {
  startsAt: string
  endsAt: string
  // Only for people who can manage sessions: the link itself is the secret.
  share: ShareInfo | null
}

// ---------------------------------------------------------------------------
// Reads

export async function listSessions(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<SessionSummary[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const { scope, roomId } = sessionListSchema.parse(filter)
  const now = new Date()
  const rows = await tenantDb(ctx).recordingSession.findMany({
    where: {
      ...(roomId && { roomId }),
      ...(scope === 'upcoming' && { endsAt: { gte: now } }),
      ...(scope === 'past' && { endsAt: { lt: now } })
    },
    orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
    take: 200,
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      startsAt: true,
      endsAt: true,
      room: {
        select: { name: true, studio: { select: { timezone: true } } }
      },
      _count: { select: { channels: true } }
    }
  })
  return rows.map((row) => {
    const timeZone = row.room?.studio.timezone ?? DEFAULT_TIMEZONE
    return {
      id: row.id,
      name: row.name,
      client: row.client,
      status: row.status as SessionStatus,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      startsLocal: formatLocalInput(row.startsAt, timeZone),
      timeZone,
      roomName: row.room?.name ?? null,
      channelCount: row._count.channels
    }
  })
}

export async function getActiveShare(
  ctx: TenantContext,
  sessionId: string
): Promise<ShareInfo | null> {
  const link = await tenantDb(ctx).sessionShareLink.findFirst({
    where: {
      sessionId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    orderBy: { createdAt: 'desc' },
    select: { token: true, expiresAt: true }
  })
  return link
    ? {
        token: link.token,
        expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null
      }
    : null
}

export async function getSession(
  ctx: TenantContext,
  sessionId: string
): Promise<SessionDetail> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const overview = await loadSessionOverview(tenantDb(ctx), sessionId)
  if (!overview) throw notFound('Session')
  const { units, ...rest } = overview
  void units
  const canManage = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)
  return {
    ...rest,
    startsAt: overview.startsAt.toISOString(),
    endsAt: overview.endsAt.toISOString(),
    share: canManage ? await getActiveShare(ctx, sessionId) : null
  }
}

// ---------------------------------------------------------------------------
// Create

type NewItem = Record<string, unknown>

function scale(value: number, from: number, to: number): number {
  return from > 0 ? Math.round((value * to) / from) : value
}

async function itemsForStart(
  ctx: TenantContext,
  startFrom: StartFrom,
  target: { widthMm: number; lengthMm: number }
): Promise<NewItem[]> {
  const db = tenantDb(ctx)
  if (startFrom.kind === 'blank') return []

  if (startFrom.kind === 'builtin') {
    const template = getBuiltInTemplate(startFrom.templateId)
    if (!template) throw notFound('Template')
    return placeTemplate(template, target).map((item, index) => ({
      ...item,
      sortOrder: index
    }))
  }

  if (startFrom.kind === 'template') {
    requireFeature(ctx, Feature.TEMPLATES)
  }
  const source = await db.layout.findFirst({
    where:
      startFrom.kind === 'template'
        ? { id: startFrom.layoutId, isTemplate: true }
        : { sessionId: startFrom.sessionId },
    select: {
      widthMm: true,
      lengthMm: true,
      items: { orderBy: [{ sortOrder: 'asc' }], select: itemSelect }
    }
  })
  if (!source)
    throw notFound(startFrom.kind === 'template' ? 'Template' : 'Session')
  const isTemplate = startFrom.kind === 'template'
  return source.items.map(({ id: _id, ...item }) => ({
    ...item,
    xMm: scale(item.xMm, source.widthMm, target.widthMm),
    yMm: scale(item.yMm, source.lengthMm, target.lengthMm),
    // A template carries no units; a copied session keeps its microphones.
    micUnitId: isTemplate ? null : item.micUnitId,
    equipmentItemId: isTemplate ? null : item.equipmentItemId,
    recommendationRef: null
  }))
}

async function resolveRoom(
  ctx: TenantContext,
  roomId: string | null | undefined
) {
  if (!roomId) return null
  const room = await tenantDb(ctx).room.findFirst({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      widthMm: true,
      lengthMm: true,
      heightMm: true,
      studio: { select: { timezone: true } }
    }
  })
  if (!room) throw notFound('Room')
  return room
}

function parseTimes(
  starts: string,
  ends: string,
  timeZone: string
): { startsAt: Date; endsAt: Date } {
  const startsAt = localToUtc(starts, timeZone)
  const endsAt = localToUtc(ends, timeZone)
  if (!startsAt || !endsAt) throw badRequest('Use a real date and time')
  if (endsAt <= startsAt)
    throw badRequest('The session must end after it starts')
  return { startsAt, endsAt }
}

export async function createSession(
  ctx: TenantContext,
  input: unknown
): Promise<{ id: string }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = sessionInputSchema.parse(input)
  const db = tenantDb(ctx)

  const room = await resolveRoom(ctx, data.roomId)
  const timeZone = room?.studio.timezone ?? DEFAULT_TIMEZONE
  const { startsAt, endsAt } = parseTimes(data.startsAt, data.endsAt, timeZone)
  const dims = room ?? DEFAULT_ROOM
  const items = await itemsForStart(ctx, data.startFrom, dims)

  const sessionId = randomUUID()
  await db.$transaction(async (tx) => {
    await tx.recordingSession.create({
      data: {
        id: sessionId,
        organisationId: ctx.organisationId,
        roomId: room?.id ?? null,
        name: data.name,
        client: data.client ?? null,
        startsAt,
        endsAt,
        status: data.status,
        channelsAvailable: data.channelsAvailable ?? null,
        phantomMode: data.phantomMode,
        notes: data.notes ?? null,
        createdById: ctx.userId
      }
    })
    const layout = await tx.layout.create({
      data: {
        organisationId: ctx.organisationId,
        sessionId,
        isTemplate: false,
        roomId: room?.id ?? null,
        name: data.name,
        widthMm: dims.widthMm,
        lengthMm: dims.lengthMm,
        heightMm: dims.heightMm,
        createdById: ctx.userId
      },
      select: { id: true }
    })
    if (items.length > 0) {
      await tx.layoutItem.createMany({
        data: items.map((item, index) => ({
          sortOrder: index,
          ...item,
          id: randomUUID(),
          layoutId: layout.id,
          organisationId: ctx.organisationId
        })) as never
      })
    }
    await syncInputList(tx, ctx.organisationId, sessionId, layout.id)
  })

  await recordAudit(ctx, {
    action: 'session.create',
    entityType: 'session',
    entityId: sessionId,
    summary: `Created session ${data.name}`,
    metadata: { startFrom: data.startFrom.kind, items: items.length }
  })
  return { id: sessionId }
}

export async function duplicateSession(
  ctx: TenantContext,
  sessionId: string
): Promise<{ id: string }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const source = await loadSessionOverview(tenantDb(ctx), sessionId)
  if (!source) throw notFound('Session')
  return createSession(ctx, {
    name: `${source.name} (copy)`.slice(0, 120),
    roomId: source.roomId,
    client: source.client,
    startsAt: source.startsLocal,
    endsAt: source.endsLocal,
    channelsAvailable: source.channelsAvailable,
    phantomMode: source.phantomMode,
    notes: source.notes,
    startFrom: { kind: 'session', sessionId }
  })
}

// ---------------------------------------------------------------------------
// Update and delete

export async function updateSession(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = sessionUpdateSchema.parse(input)
  const db = tenantDb(ctx)

  const existing = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: {
      name: true,
      startsAt: true,
      endsAt: true,
      roomId: true,
      room: { select: { studio: { select: { timezone: true } } } }
    }
  })
  if (!existing) throw notFound('Session')

  const roomChanged = data.roomId !== undefined
  const room = roomChanged ? await resolveRoom(ctx, data.roomId) : null
  const timeZone = roomChanged
    ? (room?.studio.timezone ?? DEFAULT_TIMEZONE)
    : (existing.room?.studio.timezone ?? DEFAULT_TIMEZONE)

  const startsAt = data.startsAt
    ? localToUtc(data.startsAt, timeZone)
    : existing.startsAt
  const endsAt = data.endsAt
    ? localToUtc(data.endsAt, timeZone)
    : existing.endsAt
  if (!startsAt || !endsAt) throw badRequest('Use a real date and time')
  if (endsAt <= startsAt)
    throw badRequest('The session must end after it starts')

  const { name, status, client, notes, channelsAvailable, phantomMode } = data
  const { count } = await db.recordingSession.updateMany({
    where: { id: sessionId },
    data: {
      ...(name !== undefined && { name }),
      ...(status !== undefined && { status }),
      ...(client !== undefined && { client }),
      ...(notes !== undefined && { notes }),
      ...(channelsAvailable !== undefined && { channelsAvailable }),
      ...(phantomMode !== undefined && { phantomMode }),
      ...(roomChanged && { roomId: room?.id ?? null }),
      ...(data.startsAt && { startsAt }),
      ...(data.endsAt && { endsAt })
    }
  })
  if (count === 0) throw notFound('Session')

  await recordAudit(ctx, {
    action: 'session.update',
    entityType: 'session',
    entityId: sessionId,
    summary: `Updated session ${data.name ?? existing.name}`,
    metadata: { fields: Object.keys(data) }
  })
}

export async function deleteSession(
  ctx: TenantContext,
  sessionId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const existing = await db.recordingSession.findFirst({
    where: { id: sessionId },
    select: { name: true }
  })
  if (!existing) throw notFound('Session')
  // Desk photos are blobs, so they go before the rows that point at them.
  const recall = await db.recallSheet.findFirst({
    where: { sessionId },
    select: { id: true }
  })
  if (recall) await deleteAttachmentsFor(ctx, 'recall_sheet', recall.id)
  await db.recordingSession.deleteMany({ where: { id: sessionId } })
  await recordAudit(ctx, {
    action: 'session.delete',
    entityType: 'session',
    entityId: sessionId,
    summary: `Deleted session ${existing.name}`
  })
}

// ---------------------------------------------------------------------------
// Input list

async function assertSession(ctx: TenantContext, sessionId: string) {
  const session = await tenantDb(ctx).recordingSession.findFirst({
    where: { id: sessionId },
    select: { id: true, name: true }
  })
  if (!session) throw notFound('Session')
  return session
}

export async function createChannel(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<{ id: string; number: number }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = channelInputSchema.parse(input)
  await assertSession(ctx, sessionId)
  const db = tenantDb(ctx)

  const existing = await db.inputChannel.findMany({
    where: { sessionId },
    select: { number: true }
  })
  if (existing.length >= MAX_CHANNELS) {
    throw planLimit('input channels per session', MAX_CHANNELS)
  }
  const number = nextChannelNumber(existing.map((c) => c.number))
  const created = await db.inputChannel.create({
    data: {
      organisationId: ctx.organisationId,
      sessionId,
      number,
      layoutItemId: null,
      kind: data.kind,
      source: data.source,
      micUnitId: null,
      stand: data.stand ?? null,
      preampInput: data.preampInput ?? null,
      phantom: data.phantom,
      padDb: data.padDb ?? null,
      dawName: data.dawName ?? null,
      notes: data.notes ?? null
    },
    select: { id: true }
  })
  await recordAudit(ctx, {
    action: 'channel.create',
    entityType: 'session',
    entityId: sessionId,
    summary: `Added input ${number} (${data.source})`
  })
  return { id: created.id, number }
}

export async function updateChannel(
  ctx: TenantContext,
  sessionId: string,
  channelId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = channelUpdateSchema.parse(input)
  const db = tenantDb(ctx)

  const channel = await db.inputChannel.findFirst({
    where: { id: channelId, sessionId },
    select: { id: true, number: true, layoutItemId: true, micUnitId: true }
  })
  if (!channel) throw notFound('Input channel')

  const unitChanged =
    data.micUnitId !== undefined && data.micUnitId !== channel.micUnitId
  if (data.micUnitId) {
    await assertOwnedRefs(db, [
      { micUnitId: data.micUnitId, equipmentItemId: null }
    ])
  }

  // The layout item owns the unit and the source; a linked channel writes
  // through so the two can't disagree (ADR 0016 decision 3).
  const writeThrough = channel.layoutItemId
    ? {
        ...(data.source !== undefined && { label: data.source }),
        ...(data.micUnitId !== undefined && { micUnitId: data.micUnitId })
      }
    : {}

  let phantom = data.phantom
  if (unitChanged && phantom === undefined) {
    const units = await loadUnitInfos(db, [data.micUnitId])
    phantom = defaultPhantom(
      data.micUnitId ? units.get(data.micUnitId) : undefined
    )
  }

  await db.$transaction(async (tx) => {
    await tx.inputChannel.updateMany({
      where: { id: channelId, sessionId },
      data: { ...data, ...(phantom !== undefined && { phantom }) }
    })
    if (channel.layoutItemId && Object.keys(writeThrough).length > 0) {
      await tx.layoutItem.updateMany({
        where: { id: channel.layoutItemId },
        data: writeThrough
      })
    }
  })
  await recordAudit(ctx, {
    action: 'channel.update',
    entityType: 'session',
    entityId: sessionId,
    summary: `Updated input ${channel.number}`,
    metadata: { fields: Object.keys(data) }
  })
}

export async function deleteChannel(
  ctx: TenantContext,
  sessionId: string,
  channelId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const channel = await db.inputChannel.findFirst({
    where: { id: channelId, sessionId },
    select: { number: true, layoutItemId: true, source: true }
  })
  if (!channel) throw notFound('Input channel')
  if (channel.layoutItemId) {
    throw badRequest(
      'This input comes from a microphone on the layout. Remove it from the layout instead.'
    )
  }
  await db.inputChannel.deleteMany({ where: { id: channelId, sessionId } })
  await recordAudit(ctx, {
    action: 'channel.delete',
    entityType: 'session',
    entityId: sessionId,
    summary: `Removed input ${channel.number} (${channel.source})`
  })
}

// Sets the numbering to the order given (1..n). Used for drag-reordering and
// for "Renumber" (the same ids, sorted, closing the gaps).
export async function orderChannels(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const { ids } = channelOrderSchema.parse(input)
  await assertSession(ctx, sessionId)
  const db = tenantDb(ctx)

  const existing = await db.inputChannel.findMany({
    where: { sessionId },
    select: { id: true }
  })
  const known = new Set(existing.map((c) => c.id))
  if (
    ids.length !== known.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !known.has(id))
  ) {
    throw badRequest('List every input of this session exactly once')
  }

  await db.$transaction(async (tx) => {
    // (sessionId, number) is unique, so move everything out of the way first.
    await tx.inputChannel.updateMany({
      where: { sessionId },
      data: { number: { increment: 1000 } }
    })
    for (const [index, id] of ids.entries()) {
      await tx.inputChannel.updateMany({
        where: { id, sessionId },
        data: { number: index + 1 }
      })
    }
  })
  await recordAudit(ctx, {
    action: 'channel.order',
    entityType: 'session',
    entityId: sessionId,
    summary: 'Reordered the input list'
  })
}
