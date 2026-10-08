import { recordAudit } from '@/lib/audit'
import { notFound, planLimit } from '@/lib/errors'
import { canAdd, getPlanLimits } from '@/lib/plans'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import {
  roomInputSchema,
  roomUpdateSchema,
  studioInputSchema,
  studioUpdateSchema
} from '@/lib/validation'
import { Permission } from '@/types/rbac'

export interface StudioSummary {
  id: string
  name: string
  address: string | null
  timezone: string
  roomCount: number
}

export interface RoomRow {
  id: string
  studioId: string
  name: string
  widthMm: number
  lengthMm: number
  heightMm: number | null
  notes: string | null
}

export interface StudioDetail extends Omit<StudioSummary, 'roomCount'> {
  notes: string | null
  rooms: RoomRow[]
}

const roomSelect = {
  id: true,
  studioId: true,
  name: true,
  widthMm: true,
  lengthMm: true,
  heightMm: true,
  notes: true
} as const

// ---------------------------------------------------------------------------
// Studios
// ---------------------------------------------------------------------------

export async function listStudios(
  ctx: TenantContext
): Promise<StudioSummary[]> {
  requirePermission(ctx, Permission.VIEW_STUDIOS)
  const studios = await tenantDb(ctx).studio.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      _count: { select: { rooms: true } }
    }
  })
  return studios.map(({ _count, ...studio }) => ({
    ...studio,
    roomCount: _count.rooms
  }))
}

export async function getStudio(
  ctx: TenantContext,
  studioId: string
): Promise<StudioDetail> {
  requirePermission(ctx, Permission.VIEW_STUDIOS)
  const studio = await tenantDb(ctx).studio.findFirst({
    where: { id: studioId },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      notes: true,
      rooms: { orderBy: { name: 'asc' }, select: roomSelect }
    }
  })
  if (!studio) throw notFound('Studio')
  return studio
}

export async function createStudio(
  ctx: TenantContext,
  input: unknown
): Promise<StudioDetail> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const data = studioInputSchema.parse(input)
  const db = tenantDb(ctx)

  const count = await db.studio.count()
  if (!canAdd(ctx.planTier, 'studios', count)) {
    throw planLimit('studios', getPlanLimits(ctx.planTier).studios)
  }

  const studio = await db.studio.create({
    data: { ...data, organisationId: ctx.organisationId },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      notes: true
    }
  })
  await recordAudit(ctx, {
    action: 'studio.create',
    entityType: 'studio',
    entityId: studio.id,
    summary: `Created studio ${studio.name}`
  })
  return { ...studio, rooms: [] }
}

export async function updateStudio(
  ctx: TenantContext,
  studioId: string,
  input: unknown
): Promise<StudioSummary> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const data = studioUpdateSchema.parse(input)
  const db = tenantDb(ctx)

  const { count } = await db.studio.updateMany({
    where: { id: studioId },
    data
  })
  if (count === 0) throw notFound('Studio')

  const studio = await db.studio.findFirstOrThrow({
    where: { id: studioId },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      _count: { select: { rooms: true } }
    }
  })
  await recordAudit(ctx, {
    action: 'studio.update',
    entityType: 'studio',
    entityId: studio.id,
    summary: `Updated studio ${studio.name}`,
    metadata: { fields: Object.keys(data) }
  })
  const { _count, ...rest } = studio
  return { ...rest, roomCount: _count.rooms }
}

export async function deleteStudio(
  ctx: TenantContext,
  studioId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const db = tenantDb(ctx)

  const studio = await db.studio.findFirst({
    where: { id: studioId },
    select: { id: true, name: true }
  })
  if (!studio) throw notFound('Studio')

  await db.studio.deleteMany({ where: { id: studioId } })
  await recordAudit(ctx, {
    action: 'studio.delete',
    entityType: 'studio',
    entityId: studio.id,
    summary: `Deleted studio ${studio.name} and its rooms`
  })
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function createRoom(
  ctx: TenantContext,
  studioId: string,
  input: unknown
): Promise<RoomRow> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const data = roomInputSchema.parse(input)
  const db = tenantDb(ctx)

  const studio = await db.studio.findFirst({
    where: { id: studioId },
    select: { id: true, name: true }
  })
  if (!studio) throw notFound('Studio')

  // Room limits are organisation-wide, not per studio.
  const count = await db.room.count()
  if (!canAdd(ctx.planTier, 'rooms', count)) {
    throw planLimit('rooms', getPlanLimits(ctx.planTier).rooms)
  }

  const room = await db.room.create({
    data: { ...data, studioId, organisationId: ctx.organisationId },
    select: roomSelect
  })
  await recordAudit(ctx, {
    action: 'room.create',
    entityType: 'room',
    entityId: room.id,
    summary: `Created room ${room.name} in ${studio.name}`
  })
  return room
}

export async function updateRoom(
  ctx: TenantContext,
  roomId: string,
  input: unknown
): Promise<RoomRow> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const data = roomUpdateSchema.parse(input)
  const db = tenantDb(ctx)

  const { count } = await db.room.updateMany({ where: { id: roomId }, data })
  if (count === 0) throw notFound('Room')

  const room = await db.room.findFirstOrThrow({
    where: { id: roomId },
    select: roomSelect
  })
  await recordAudit(ctx, {
    action: 'room.update',
    entityType: 'room',
    entityId: room.id,
    summary: `Updated room ${room.name}`,
    metadata: { fields: Object.keys(data) }
  })
  return room
}

export async function deleteRoom(
  ctx: TenantContext,
  roomId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_STUDIOS)
  const db = tenantDb(ctx)

  const room = await db.room.findFirst({
    where: { id: roomId },
    select: { id: true, name: true }
  })
  if (!room) throw notFound('Room')

  await db.room.deleteMany({ where: { id: roomId } })
  await recordAudit(ctx, {
    action: 'room.delete',
    entityType: 'room',
    entityId: room.id,
    summary: `Deleted room ${room.name}`
  })
}

export async function getOrganisationUsage(ctx: TenantContext) {
  requirePermission(ctx, Permission.VIEW_ORGANISATION)
  const db = tenantDb(ctx)
  const [studios, rooms] = await Promise.all([
    db.studio.count(),
    db.room.count()
  ])
  return { studios, rooms }
}
