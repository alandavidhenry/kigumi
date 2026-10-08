import { deleteAttachmentsFor, listAttachments } from '@/lib/attachments'
import type { AttachmentRow } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import type { EquipmentCategory, EquipmentStatus } from '@/lib/equipment-types'
import { notFound, planLimit } from '@/lib/errors'
import { canAdd, getPlanLimits } from '@/lib/plans'
import { toJsonValue } from '@/lib/prisma-json'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import type { TenantDb } from '@/lib/tenant-db'
import {
  equipmentFilterSchema,
  equipmentInputSchema,
  equipmentUpdateSchema
} from '@/lib/validation'
import { Permission } from '@/types/rbac'

export interface EquipmentRow {
  id: string
  category: EquipmentCategory
  make: string
  model: string
  serial: string | null
  quantity: number
  status: EquipmentStatus
  roomId: string | null
  roomName: string | null
  purchaseDate: string | null // YYYY-MM-DD
  purchasePriceMinor: number | null // per item
  supplier: string | null
  tags: string[]
  customFields: Record<string, string> | null
  notes: string | null
}

export interface EquipmentDetail extends EquipmentRow {
  photos: AttachmentRow[]
}

export const equipmentSelect = {
  id: true,
  category: true,
  make: true,
  model: true,
  serial: true,
  quantity: true,
  status: true,
  roomId: true,
  purchaseDate: true,
  purchasePriceMinor: true,
  supplier: true,
  tags: true,
  customFields: true,
  notes: true,
  room: { select: { name: true } }
} as const

interface RawEquipment {
  id: string
  category: string
  make: string
  model: string
  serial: string | null
  quantity: number
  status: string
  roomId: string | null
  purchaseDate: Date | null
  purchasePriceMinor: number | null
  supplier: string | null
  tags: string[]
  customFields: unknown
  notes: string | null
  room: { name: string } | null
}

export function toEquipmentRow(raw: RawEquipment): EquipmentRow {
  const { room, purchaseDate, customFields, category, status, ...rest } = raw
  return {
    ...rest,
    category: category as EquipmentCategory,
    status: status as EquipmentStatus,
    roomName: room?.name ?? null,
    purchaseDate: purchaseDate ? purchaseDate.toISOString().slice(0, 10) : null,
    customFields: (customFields as Record<string, string> | null) ?? null
  }
}

export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export async function assertRoomExists(db: TenantDb, roomId: string | null) {
  if (!roomId) return
  const room = await db.room.findFirst({
    where: { id: roomId },
    select: { id: true }
  })
  if (!room) throw notFound('Room')
}

export function describeItem(item: { make: string; model: string }) {
  return `${item.make} ${item.model}`
}

export function buildWhere(filter: unknown) {
  const { q, category, status, roomId, tag } = equipmentFilterSchema.parse(
    filter ?? {}
  )
  return {
    ...(category && { category }),
    ...(status && { status }),
    ...(roomId && { roomId }),
    ...(tag && { tags: { has: tag } }),
    ...(q && {
      OR: [
        { make: { contains: q, mode: 'insensitive' as const } },
        { model: { contains: q, mode: 'insensitive' as const } },
        { serial: { contains: q, mode: 'insensitive' as const } },
        { supplier: { contains: q, mode: 'insensitive' as const } },
        { tags: { has: q.toLowerCase() } }
      ]
    })
  }
}

export async function listEquipment(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<EquipmentRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const rows = await tenantDb(ctx).equipmentItem.findMany({
    where: buildWhere(filter),
    orderBy: [{ category: 'asc' }, { make: 'asc' }, { model: 'asc' }],
    select: equipmentSelect
  })
  return rows.map(toEquipmentRow)
}

export async function countEquipment(ctx: TenantContext): Promise<number> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  return tenantDb(ctx).equipmentItem.count()
}

export async function getEquipment(
  ctx: TenantContext,
  id: string
): Promise<EquipmentDetail> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const row = await tenantDb(ctx).equipmentItem.findFirst({
    where: { id },
    select: equipmentSelect
  })
  if (!row) throw notFound('Equipment')
  return {
    ...toEquipmentRow(row),
    photos: await listAttachments(ctx, 'equipment', id)
  }
}

export async function createEquipment(
  ctx: TenantContext,
  input: unknown
): Promise<EquipmentRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const { purchaseDate, customFields, ...data } =
    equipmentInputSchema.parse(input)
  const db = tenantDb(ctx)

  const count = await db.equipmentItem.count()
  if (!canAdd(ctx.planTier, 'inventoryItems', count)) {
    throw planLimit(
      'inventory items',
      getPlanLimits(ctx.planTier).inventoryItems
    )
  }
  await assertRoomExists(db, data.roomId ?? null)

  const row = await db.equipmentItem.create({
    data: {
      ...data,
      organisationId: ctx.organisationId,
      purchaseDate: toDate(purchaseDate),
      customFields: toJsonValue(customFields)
    },
    select: equipmentSelect
  })
  await recordAudit(ctx, {
    action: 'equipment.create',
    entityType: 'equipment',
    entityId: row.id,
    summary: `Added ${describeItem(row)}`
  })
  return toEquipmentRow(row)
}

export async function updateEquipment(
  ctx: TenantContext,
  id: string,
  input: unknown
): Promise<EquipmentRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const { purchaseDate, customFields, ...data } =
    equipmentUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  if (data.roomId !== undefined) await assertRoomExists(db, data.roomId)

  const { count } = await db.equipmentItem.updateMany({
    where: { id },
    data: {
      ...data,
      ...(purchaseDate !== undefined && { purchaseDate: toDate(purchaseDate) }),
      ...(customFields !== undefined && {
        customFields: toJsonValue(customFields)
      })
    }
  })
  if (count === 0) throw notFound('Equipment')

  const row = await db.equipmentItem.findFirstOrThrow({
    where: { id },
    select: equipmentSelect
  })
  await recordAudit(ctx, {
    action: 'equipment.update',
    entityType: 'equipment',
    entityId: row.id,
    summary: `Updated ${describeItem(row)}`,
    metadata: { fields: Object.keys(input as Record<string, unknown>) }
  })
  return toEquipmentRow(row)
}

export async function deleteEquipment(
  ctx: TenantContext,
  id: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)
  const row = await db.equipmentItem.findFirst({
    where: { id },
    select: { id: true, make: true, model: true }
  })
  if (!row) throw notFound('Equipment')

  await deleteAttachmentsFor(ctx, 'equipment', id)
  await db.equipmentItem.deleteMany({ where: { id } })
  await recordAudit(ctx, {
    action: 'equipment.delete',
    entityType: 'equipment',
    entityId: row.id,
    summary: `Deleted ${describeItem(row)}`
  })
}

export interface RoomOption {
  id: string
  name: string
  studioName: string
}

// Rooms an item can be located in, for forms and filters.
export async function listRoomOptions(
  ctx: TenantContext
): Promise<RoomOption[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const rooms = await tenantDb(ctx).room.findMany({
    orderBy: [{ studio: { name: 'asc' } }, { name: 'asc' }],
    select: { id: true, name: true, studio: { select: { name: true } } }
  })
  return rooms.map(({ studio, ...room }) => ({
    ...room,
    studioName: studio.name
  }))
}
