import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { Feature } from '@/lib/plans'
import { itemSelect, layoutSelect, toLayoutDoc } from '@/lib/sessions/queries'
import type { Db } from '@/lib/sessions/queries'
import { syncInputList } from '@/lib/sessions/sync'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { changedItems, diffItems } from './diff'
import {
  saveLayoutSchema,
  templateInputSchema,
  templateUpdateSchema
} from './schemas'

import type { SaveLayoutItem } from './schemas'
import type { LayoutDoc } from './types'

// Layout reads and writes (PLAN §4.5, ADR 0016). A layout is either a
// session's own copy or a template. Saving sends the whole item list with the
// version the editor loaded; a stale version is a 409, never a silent merge.

const NEW_ID_PREFIX = 'new_'

export interface SaveLayoutResult {
  layout: LayoutDoc
  // Editor-side temporary id -> stored id, so edits made while the save was in
  // flight can be re-pointed.
  idMap: Record<string, string>
}

function itemData(item: SaveLayoutItem) {
  const { id, ...rest } = item
  void id
  return rest
}

// Units and inventory items must belong to the caller's organisation. A foreign
// id looks like it doesn't exist.
export async function assertOwnedRefs(
  db: Db,
  items: readonly Pick<SaveLayoutItem, 'micUnitId' | 'equipmentItemId'>[]
) {
  const unitIds = [
    ...new Set(items.map((i) => i.micUnitId).filter((v): v is string => !!v))
  ]
  if (unitIds.length > 0) {
    const found = await db.microphoneUnit.count({
      where: { id: { in: unitIds } }
    })
    if (found !== unitIds.length) throw notFound('Microphone')
  }
  const itemIds = [
    ...new Set(
      items.map((i) => i.equipmentItemId).filter((v): v is string => !!v)
    )
  ]
  if (itemIds.length > 0) {
    const found = await db.equipmentItem.count({
      where: { id: { in: itemIds } }
    })
    if (found !== itemIds.length) throw notFound('Equipment item')
  }
}

export async function getLayout(
  ctx: TenantContext,
  layoutId: string
): Promise<LayoutDoc & { sessionId: string | null; isTemplate: boolean }> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const row = await tenantDb(ctx).layout.findFirst({
    where: { id: layoutId },
    select: { ...layoutSelect, sessionId: true, isTemplate: true }
  })
  if (!row) throw notFound('Layout')
  if (row.isTemplate) requireFeature(ctx, Feature.TEMPLATES)
  return {
    ...toLayoutDoc(row),
    sessionId: row.sessionId,
    isTemplate: row.isTemplate
  }
}

export async function saveLayout(
  ctx: TenantContext,
  layoutId: string,
  input: unknown
): Promise<SaveLayoutResult> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = saveLayoutSchema.parse(input)
  const db = tenantDb(ctx)

  const layout = await db.layout.findFirst({
    where: { id: layoutId },
    select: {
      id: true,
      name: true,
      version: true,
      sessionId: true,
      isTemplate: true,
      items: { select: itemSelect }
    }
  })
  if (!layout) throw notFound('Layout')
  if (layout.isTemplate) requireFeature(ctx, Feature.TEMPLATES)
  if (layout.version !== data.version) {
    throw conflict(
      'This layout was changed somewhere else. Reload to get the latest.',
      { version: layout.version }
    )
  }

  const diff = diffItems(layout.items, data.items)
  const stray = diff.added.find((i) => !i.id.startsWith(NEW_ID_PREFIX))
  if (stray) {
    throw conflict(
      'An item you edited was removed somewhere else. Reload to get the latest.',
      { version: layout.version }
    )
  }
  await assertOwnedRefs(db, data.items)

  const idMap: Record<string, string> = {}
  for (const item of diff.added) idMap[item.id] = randomUUID()

  await db.$transaction(async (tx) => {
    const { count } = await tx.layout.updateMany({
      where: { id: layoutId, version: data.version },
      data: {
        version: { increment: 1 },
        ...(data.name && { name: data.name }),
        ...(data.gridMm && { gridMm: data.gridMm }),
        ...(data.snapMm !== undefined && { snapMm: data.snapMm })
      }
    })
    if (count === 0) {
      throw conflict(
        'This layout was changed somewhere else. Reload to get the latest.'
      )
    }

    if (diff.removed.length > 0) {
      const removedIds = diff.removed.map((r) => r.id)
      await tx.inputChannel.deleteMany({
        where: { layoutItemId: { in: removedIds } }
      })
      await tx.layoutItem.deleteMany({
        where: { layoutId, id: { in: removedIds } }
      })
    }
    for (const item of changedItems(layout.items, diff.kept)) {
      await tx.layoutItem.updateMany({
        where: { id: item.id, layoutId },
        data: itemData(item)
      })
    }
    if (diff.added.length > 0) {
      await tx.layoutItem.createMany({
        data: diff.added.map((item) => ({
          ...itemData(item),
          id: idMap[item.id],
          layoutId,
          organisationId: ctx.organisationId
        }))
      })
    }
    if (layout.sessionId) {
      await syncInputList(tx, ctx.organisationId, layout.sessionId, layoutId)
    }
  })

  if (diff.structural) {
    await recordAudit(ctx, {
      action: layout.isTemplate ? 'template.update' : 'layout.update',
      entityType: layout.isTemplate ? 'template' : 'layout',
      entityId: layoutId,
      summary: `Changed the layout ${layout.name}: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.unitChanged.length} microphones changed`,
      metadata: {
        added: diff.added.length,
        removed: diff.removed.length,
        unitChanged: diff.unitChanged.length
      }
    })
  }

  const fresh = await db.layout.findFirstOrThrow({
    where: { id: layoutId },
    select: layoutSelect
  })
  return { layout: toLayoutDoc(fresh), idMap }
}

// Re-reads the room and updates the footprint. Items are not moved; any that
// end up outside are flagged by the warnings.
export async function matchRoomSize(
  ctx: TenantContext,
  layoutId: string
): Promise<LayoutDoc> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const layout = await db.layout.findFirst({
    where: { id: layoutId },
    select: {
      id: true,
      name: true,
      isTemplate: true,
      roomId: true,
      session: { select: { roomId: true } }
    }
  })
  if (!layout) throw notFound('Layout')
  if (layout.isTemplate) requireFeature(ctx, Feature.TEMPLATES)
  const roomId = layout.session?.roomId ?? layout.roomId
  if (!roomId) throw badRequest('This layout has no room to match.')
  const room = await db.room.findFirst({
    where: { id: roomId },
    select: { widthMm: true, lengthMm: true, heightMm: true }
  })
  if (!room) throw notFound('Room')

  await db.layout.updateMany({
    where: { id: layoutId },
    data: {
      widthMm: room.widthMm,
      lengthMm: room.lengthMm,
      heightMm: room.heightMm,
      version: { increment: 1 }
    }
  })
  await recordAudit(ctx, {
    action: 'layout.update',
    entityType: layout.isTemplate ? 'template' : 'layout',
    entityId: layoutId,
    summary: `Matched the layout ${layout.name} to its room's size`
  })
  const fresh = await db.layout.findFirstOrThrow({
    where: { id: layoutId },
    select: layoutSelect
  })
  return toLayoutDoc(fresh)
}

// ---------------------------------------------------------------------------
// Templates (Pro, Feature.TEMPLATES)

export interface TemplateSummary {
  id: string
  name: string
  widthMm: number
  lengthMm: number
  itemCount: number
  roomName: string | null
}

export async function listTemplates(
  ctx: TenantContext
): Promise<TemplateSummary[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  requireFeature(ctx, Feature.TEMPLATES)
  const rows = await tenantDb(ctx).layout.findMany({
    where: { isTemplate: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      widthMm: true,
      lengthMm: true,
      room: { select: { name: true } },
      _count: { select: { items: true } }
    }
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
    itemCount: row._count.items,
    roomName: row.room?.name ?? null
  }))
}

// Copies a session's layout as a template. Microphone units, inventory links
// and recommendation references belong to one session, so they are dropped:
// the template keeps shapes, positions and labels only.
export async function saveTemplate(
  ctx: TenantContext,
  input: unknown
): Promise<TemplateSummary> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  requireFeature(ctx, Feature.TEMPLATES)
  const data = templateInputSchema.parse(input)
  const db = tenantDb(ctx)

  const source = await db.layout.findFirst({
    where: { sessionId: data.fromSessionId },
    select: {
      widthMm: true,
      lengthMm: true,
      heightMm: true,
      gridMm: true,
      snapMm: true,
      roomId: true,
      session: { select: { roomId: true } },
      items: { select: { ...layoutSelect.items.select } }
    }
  })
  if (!source) throw notFound('Session')

  const created = await db.$transaction(async (tx) => {
    const layout = await tx.layout.create({
      data: {
        organisationId: ctx.organisationId,
        isTemplate: true,
        sessionId: null,
        roomId: source.session?.roomId ?? source.roomId,
        name: data.name,
        widthMm: source.widthMm,
        lengthMm: source.lengthMm,
        heightMm: source.heightMm,
        gridMm: source.gridMm,
        snapMm: source.snapMm,
        createdById: ctx.userId
      },
      select: { id: true }
    })
    if (source.items.length > 0) {
      await tx.layoutItem.createMany({
        data: source.items.map(({ id: _id, ...item }) => ({
          ...item,
          micUnitId: null,
          equipmentItemId: null,
          recommendationRef: null,
          layoutId: layout.id,
          organisationId: ctx.organisationId
        }))
      })
    }
    return layout
  })

  await recordAudit(ctx, {
    action: 'template.create',
    entityType: 'template',
    entityId: created.id,
    summary: `Saved the layout template ${data.name}`,
    metadata: { items: source.items.length }
  })
  return {
    id: created.id,
    name: data.name,
    widthMm: source.widthMm,
    lengthMm: source.lengthMm,
    itemCount: source.items.length,
    roomName: null
  }
}

export async function renameTemplate(
  ctx: TenantContext,
  layoutId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  requireFeature(ctx, Feature.TEMPLATES)
  const data = templateUpdateSchema.parse(input)
  const { count } = await tenantDb(ctx).layout.updateMany({
    where: { id: layoutId, isTemplate: true },
    data: { name: data.name }
  })
  if (count === 0) throw notFound('Template')
  await recordAudit(ctx, {
    action: 'template.update',
    entityType: 'template',
    entityId: layoutId,
    summary: `Renamed a layout template to ${data.name}`
  })
}

export async function deleteTemplate(
  ctx: TenantContext,
  layoutId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  requireFeature(ctx, Feature.TEMPLATES)
  const db = tenantDb(ctx)
  const template = await db.layout.findFirst({
    where: { id: layoutId, isTemplate: true },
    select: { name: true }
  })
  if (!template) throw notFound('Template')
  await db.layout.deleteMany({ where: { id: layoutId, isTemplate: true } })
  await recordAudit(ctx, {
    action: 'template.delete',
    entityType: 'template',
    entityId: layoutId,
    summary: `Deleted the layout template ${template.name}`
  })
}
