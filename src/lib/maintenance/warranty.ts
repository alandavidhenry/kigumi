import { deleteAttachmentsFor, storePhoto } from '@/lib/attachments'
import type { AttachmentRow } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import { describeItem, toDate } from '@/lib/equipment'
import { notFound } from '@/lib/errors'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { warrantyState } from './schedule'
import { warrantyInputSchema, warrantyUpdateSchema } from './schemas'
import { MAX_FILES_PER_RECORD, MAX_FILE_BYTES } from './types'

import type { WarrantyState } from './schedule'

// Warranty records and their receipts (PLAN §4.9). Free on every plan.

export interface WarrantyRow {
  id: string
  equipmentItemId: string
  itemName: string
  startsOn: string | null // YYYY-MM-DD
  endsOn: string
  provider: string | null
  reference: string | null
  terms: string | null
  leadDays: number
  state: WarrantyState
  daysLeft: number
  files: AttachmentRow[]
}

const warrantySelect = {
  id: true,
  equipmentItemId: true,
  startsOn: true,
  endsOn: true,
  provider: true,
  reference: true,
  terms: true,
  leadDays: true,
  equipmentItem: { select: { make: true, model: true } }
} as const

type RawWarranty = {
  id: string
  equipmentItemId: string
  startsOn: Date | null
  endsOn: Date
  provider: string | null
  reference: string | null
  terms: string | null
  leadDays: number
  equipmentItem: { make: string; model: string }
}

const day = (date: Date) => date.toISOString().slice(0, 10)

function toRow(
  raw: RawWarranty,
  files: AttachmentRow[],
  now: Date
): WarrantyRow {
  return {
    id: raw.id,
    equipmentItemId: raw.equipmentItemId,
    itemName: describeItem(raw.equipmentItem),
    startsOn: raw.startsOn ? day(raw.startsOn) : null,
    endsOn: day(raw.endsOn),
    provider: raw.provider,
    reference: raw.reference,
    terms: raw.terms,
    leadDays: raw.leadDays,
    state: warrantyState(raw, now),
    daysLeft: Math.ceil((raw.endsOn.getTime() - now.getTime()) / 86_400_000),
    files
  }
}

export async function listWarranties(
  ctx: TenantContext,
  filter: { equipmentItemId?: string } = {}
): Promise<WarrantyRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const db = tenantDb(ctx)
  const rows = await db.warranty.findMany({
    where: filter.equipmentItemId
      ? { equipmentItemId: filter.equipmentItemId }
      : {},
    orderBy: { endsOn: 'asc' },
    take: 1000,
    select: warrantySelect
  })
  const files =
    rows.length === 0
      ? []
      : await db.attachment.findMany({
          where: {
            entityType: 'warranty',
            entityId: { in: rows.map((row) => row.id) }
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            entityId: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            kind: true
          }
        })
  const now = new Date()
  return rows.map((row) =>
    toRow(
      row,
      files
        .filter((file) => file.entityId === row.id)
        .map(({ entityId: _entityId, ...file }) => file),
      now
    )
  )
}

export async function createWarranty(
  ctx: TenantContext,
  input: unknown
): Promise<WarrantyRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = warrantyInputSchema.parse(input)
  const db = tenantDb(ctx)
  const item = await db.equipmentItem.findFirst({
    where: { id: data.equipmentItemId },
    select: { id: true, make: true, model: true }
  })
  if (!item) throw notFound('Equipment')

  const row = await db.warranty.create({
    data: {
      organisationId: ctx.organisationId,
      equipmentItemId: item.id,
      startsOn: toDate(data.startsOn),
      endsOn: toDate(data.endsOn)!,
      provider: data.provider,
      reference: data.reference,
      terms: data.terms,
      leadDays: data.leadDays
    },
    select: warrantySelect
  })
  await recordAudit(ctx, {
    action: 'warranty.create',
    entityType: 'equipment',
    entityId: item.id,
    summary: `Added a warranty for ${describeItem(item)}`
  })
  return toRow(row, [], new Date())
}

export async function updateWarranty(
  ctx: TenantContext,
  warrantyId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const data = warrantyUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const current = await db.warranty.findFirst({
    where: { id: warrantyId },
    select: warrantySelect
  })
  if (!current) throw notFound('Warranty')

  const startsOn =
    data.startsOn !== undefined ? toDate(data.startsOn) : current.startsOn
  const endsOn = data.endsOn ? toDate(data.endsOn)! : current.endsOn
  if (startsOn && startsOn > endsOn) {
    // Same rule the create schema applies, checked against stored values.
    warrantyInputSchema.parse({
      equipmentItemId: current.equipmentItemId,
      startsOn: day(startsOn),
      endsOn: day(endsOn)
    })
  }
  await db.warranty.updateMany({
    where: { id: warrantyId },
    data: {
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.reference !== undefined && { reference: data.reference }),
      ...(data.terms !== undefined && { terms: data.terms }),
      ...(data.leadDays !== undefined && { leadDays: data.leadDays }),
      startsOn,
      endsOn
    }
  })
  await recordAudit(ctx, {
    action: 'warranty.update',
    entityType: 'equipment',
    entityId: current.equipmentItemId,
    summary: `Updated the warranty for ${describeItem(current.equipmentItem)}`
  })
}

export async function deleteWarranty(
  ctx: TenantContext,
  warrantyId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)
  const warranty = await db.warranty.findFirst({
    where: { id: warrantyId },
    select: warrantySelect
  })
  if (!warranty) throw notFound('Warranty')
  await deleteAttachmentsFor(ctx, 'warranty', warranty.id)
  await db.warranty.deleteMany({ where: { id: warrantyId } })
  await recordAudit(ctx, {
    action: 'warranty.delete',
    entityType: 'equipment',
    entityId: warranty.equipmentItemId,
    summary: `Deleted the warranty for ${describeItem(warranty.equipmentItem)}`
  })
}

export async function addWarrantyFile(
  ctx: TenantContext,
  warrantyId: string,
  file: { name: string; type: string; data: Buffer }
): Promise<AttachmentRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const warranty = await tenantDb(ctx).warranty.findFirst({
    where: { id: warrantyId },
    select: warrantySelect
  })
  if (!warranty) throw notFound('Warranty')
  const row = await storePhoto(
    ctx,
    {
      entityType: 'warranty',
      entityId: warranty.id,
      maxPhotos: MAX_FILES_PER_RECORD,
      document: { kind: 'receipt', maxBytes: MAX_FILE_BYTES }
    },
    file
  )
  await recordAudit(ctx, {
    action: 'warranty.file_add',
    entityType: 'equipment',
    entityId: warranty.equipmentItemId,
    summary: `Attached a receipt to the warranty for ${describeItem(warranty.equipmentItem)}`
  })
  return row
}
