import { recordAudit } from '@/lib/audit'
import { badRequest, notFound, planLimit } from '@/lib/errors'
import { canAdd, getPlanLimits } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { lockerUnitInputSchema, lockerUnitUpdateSchema } from './schemas'

import type { MicCondition, MicTransducerType } from './types'

// The mic locker: a studio's physical copies of catalogue models. A unit links
// one inventory item to one published MicrophoneModel (global catalogue).

export interface LockerUnit {
  id: string
  micModelId: string
  micSlug: string
  manufacturer: string
  model: string
  transducerType: MicTransducerType
  phantomSafe: boolean | null
  equipmentItemId: string
  serial: string | null
  condition: MicCondition
  matchedPairGroup: string | null
  notes: string | null
  equipmentStatus: string
  roomName: string | null
  // True when the item is in service. Booking by session date arrives with
  // sessions in Phase 5.
  available: boolean
}

interface RawUnit {
  id: string
  micModelId: string
  equipmentItemId: string
  serial: string | null
  condition: string
  matchedPairGroup: string | null
  notes: string | null
  equipmentItem: { status: string; room: { name: string } | null }
}

const unitSelect = {
  id: true,
  micModelId: true,
  equipmentItemId: true,
  serial: true,
  condition: true,
  matchedPairGroup: true,
  notes: true,
  equipmentItem: {
    select: { status: true, room: { select: { name: true } } }
  }
} as const

interface ModelBits {
  id: string
  slug: string
  manufacturer: string
  model: string
  transducerType: string
  phantomSafe: boolean | null
}

const modelSelect = {
  id: true,
  slug: true,
  manufacturer: true,
  model: true,
  transducerType: true,
  phantomSafe: true
} as const

function toUnit(raw: RawUnit, model: ModelBits): LockerUnit {
  return {
    id: raw.id,
    micModelId: raw.micModelId,
    micSlug: model.slug,
    manufacturer: model.manufacturer,
    model: model.model,
    transducerType: model.transducerType as MicTransducerType,
    phantomSafe: model.phantomSafe,
    equipmentItemId: raw.equipmentItemId,
    serial: raw.serial,
    condition: raw.condition as MicCondition,
    matchedPairGroup: raw.matchedPairGroup,
    notes: raw.notes,
    equipmentStatus: raw.equipmentItem.status,
    roomName: raw.equipmentItem.room?.name ?? null,
    available: raw.equipmentItem.status === 'in_service'
  }
}

// MicrophoneModel is global, so models are looked up with the plain client and
// joined in memory; the tenant-scoped units come through tenantDb.
async function modelsById(ids: string[]): Promise<Map<string, ModelBits>> {
  if (ids.length === 0) return new Map()
  const models = await prisma.microphoneModel.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: modelSelect
  })
  return new Map(models.map((model) => [model.id, model]))
}

async function loadUnits(
  ctx: TenantContext,
  where: Record<string, unknown> = {}
): Promise<LockerUnit[]> {
  const rows = await tenantDb(ctx).microphoneUnit.findMany({
    where,
    orderBy: [{ matchedPairGroup: 'asc' }, { createdAt: 'asc' }],
    select: unitSelect
  })
  const models = await modelsById(rows.map((row) => row.micModelId))
  return rows.flatMap((row) => {
    const model = models.get(row.micModelId)
    return model ? [toUnit(row, model)] : []
  })
}

export async function listLocker(ctx: TenantContext): Promise<LockerUnit[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const units = await loadUnits(ctx)
  return units.sort(
    (a, b) =>
      a.manufacturer.localeCompare(b.manufacturer) ||
      a.model.localeCompare(b.model)
  )
}

// The "In your locker" section of a mic page.
export async function listUnitsForModel(
  ctx: TenantContext,
  micModelId: string
): Promise<LockerUnit[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  return loadUnits(ctx, { micModelId })
}

export interface UnlinkedMicrophone {
  id: string
  make: string
  model: string
  serial: string | null
}

// Microphone-category inventory items not yet linked to a catalogue model.
export async function listUnlinkedMicrophones(
  ctx: TenantContext
): Promise<UnlinkedMicrophone[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  return tenantDb(ctx).equipmentItem.findMany({
    where: { category: 'microphone', micUnit: null },
    orderBy: [{ make: 'asc' }, { model: 'asc' }],
    select: { id: true, make: true, model: true, serial: true }
  })
}

async function assertPairable(
  ctx: TenantContext,
  group: string | null | undefined,
  micModelId: string,
  excludeUnitId?: string
) {
  if (!group) return
  const others = await tenantDb(ctx).microphoneUnit.findMany({
    where: {
      matchedPairGroup: group,
      ...(excludeUnitId && { id: { not: excludeUnitId } })
    },
    select: { micModelId: true }
  })
  if (others.some((other) => other.micModelId !== micModelId)) {
    throw badRequest('Units in a matched group must be the same model')
  }
  if (others.length >= 2) {
    throw badRequest('A matched group holds at most three units')
  }
}

export async function addUnit(
  ctx: TenantContext,
  input: unknown
): Promise<LockerUnit> {
  requirePermission(ctx, Permission.MANAGE_MIC_LOCKER)
  const data = lockerUnitInputSchema.parse(input)

  const model = await prisma.microphoneModel.findFirst({
    where: { id: data.micModelId, status: 'published' },
    select: modelSelect
  })
  if (!model) throw notFound('Microphone')

  const db = tenantDb(ctx)
  await assertPairable(ctx, data.matchedPairGroup, model.id)

  let equipmentItemId = data.equipmentItemId ?? null
  let createdItem = false
  if (equipmentItemId) {
    const item = await db.equipmentItem.findFirst({
      where: { id: equipmentItemId },
      select: { id: true, category: true, micUnit: { select: { id: true } } }
    })
    if (!item) throw notFound('Equipment')
    if (item.category !== 'microphone') {
      throw badRequest('Only microphone items can be added to the locker')
    }
    if (item.micUnit) {
      throw badRequest('That item is already linked to a catalogue microphone')
    }
  } else {
    const count = await db.equipmentItem.count()
    if (!canAdd(ctx.planTier, 'inventoryItems', count)) {
      throw planLimit(
        'inventory items',
        getPlanLimits(ctx.planTier).inventoryItems
      )
    }
    if (data.roomId) {
      const room = await db.room.findFirst({
        where: { id: data.roomId },
        select: { id: true }
      })
      if (!room) throw notFound('Room')
    }
    const item = await db.equipmentItem.create({
      data: {
        organisationId: ctx.organisationId,
        category: 'microphone',
        make: model.manufacturer,
        model: model.model,
        serial: data.serial,
        roomId: data.roomId ?? null,
        tags: []
      },
      select: { id: true }
    })
    equipmentItemId = item.id
    createdItem = true
  }

  let row
  try {
    row = await db.microphoneUnit.create({
      data: {
        organisationId: ctx.organisationId,
        micModelId: model.id,
        equipmentItemId,
        serial: data.serial,
        condition: data.condition,
        matchedPairGroup: data.matchedPairGroup,
        notes: data.notes
      },
      select: unitSelect
    })
  } catch (error) {
    if (createdItem) {
      await db.equipmentItem.deleteMany({ where: { id: equipmentItemId } })
    }
    throw error
  }

  await recordAudit(ctx, {
    action: 'mic_unit.create',
    entityType: 'mic_unit',
    entityId: row.id,
    summary: `Added ${model.manufacturer} ${model.model} to the mic locker`
  })
  return toUnit(row, model)
}

export async function updateUnit(
  ctx: TenantContext,
  id: string,
  input: unknown
): Promise<LockerUnit> {
  requirePermission(ctx, Permission.MANAGE_MIC_LOCKER)
  const data = lockerUnitUpdateSchema.parse(input)
  const db = tenantDb(ctx)

  const existing = await db.microphoneUnit.findFirst({
    where: { id },
    select: { id: true, micModelId: true }
  })
  if (!existing) throw notFound('Mic locker unit')
  if (data.matchedPairGroup !== undefined) {
    await assertPairable(ctx, data.matchedPairGroup, existing.micModelId, id)
  }

  await db.microphoneUnit.updateMany({ where: { id }, data })
  const row = await db.microphoneUnit.findFirstOrThrow({
    where: { id },
    select: unitSelect
  })
  const model = (await modelsById([row.micModelId])).get(row.micModelId)
  if (!model) throw notFound('Microphone')
  await recordAudit(ctx, {
    action: 'mic_unit.update',
    entityType: 'mic_unit',
    entityId: id,
    summary: `Updated ${model.manufacturer} ${model.model} in the mic locker`,
    metadata: { fields: Object.keys(data) }
  })
  return toUnit(row, model)
}

// Removes the unit only; the inventory item stays.
export async function removeUnit(
  ctx: TenantContext,
  id: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_MIC_LOCKER)
  const db = tenantDb(ctx)
  const existing = await db.microphoneUnit.findFirst({
    where: { id },
    select: { id: true, micModelId: true }
  })
  if (!existing) throw notFound('Mic locker unit')
  const model = (await modelsById([existing.micModelId])).get(
    existing.micModelId
  )
  await db.microphoneUnit.deleteMany({ where: { id } })
  await recordAudit(ctx, {
    action: 'mic_unit.delete',
    entityType: 'mic_unit',
    entityId: id,
    summary: `Removed ${model ? `${model.manufacturer} ${model.model}` : 'a microphone'} from the mic locker`
  })
}
