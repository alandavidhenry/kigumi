import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import {
  MAX_PHOTOS_PER_ITEM,
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES
} from '@/lib/equipment-types'
import { badRequest, notFound } from '@/lib/errors'
import { getPlanLimits } from '@/lib/plans'
import {
  blobPathFor,
  deleteBlob,
  downloadBlob,
  uploadBlob
} from '@/lib/storage'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

export type AttachmentEntity = 'equipment'

export interface AttachmentRow {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  kind: string
}

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  kind: true
} as const

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

// The declared content type is client-supplied, so confirm it against the
// file's magic bytes before storing anything.
export function sniffImageType(data: Uint8Array): string | null {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return 'image/png'
  }
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...data.slice(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export async function listAttachments(
  ctx: TenantContext,
  entityType: AttachmentEntity,
  entityId: string
): Promise<AttachmentRow[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  return tenantDb(ctx).attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
    select: attachmentSelect
  })
}

export async function addEquipmentPhoto(
  ctx: TenantContext,
  equipmentId: string,
  file: { name: string; type: string; data: Buffer }
): Promise<AttachmentRow> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)

  const item = await db.equipmentItem.findFirst({
    where: { id: equipmentId },
    select: { id: true, make: true, model: true }
  })
  if (!item) throw notFound('Equipment')

  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw badRequest('Photos must be JPEG, PNG or WebP')
  }
  if (file.data.length === 0 || file.data.length > MAX_PHOTO_BYTES) {
    throw badRequest(
      `Photos must be under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB`
    )
  }
  const sniffed = sniffImageType(file.data)
  if (sniffed !== file.type) {
    throw badRequest('That file is not a valid image')
  }

  const existing = await db.attachment.findMany({
    select: { entityId: true, sizeBytes: true }
  })
  if (
    existing.filter((row) => row.entityId === equipmentId).length >=
    MAX_PHOTOS_PER_ITEM
  ) {
    throw badRequest(`At most ${MAX_PHOTOS_PER_ITEM} photos per item`)
  }
  const usedBytes = existing.reduce((sum, row) => sum + row.sizeBytes, 0)
  const limitBytes = getPlanLimits(ctx.planTier).storageMb * 1024 * 1024
  if (usedBytes + file.data.length > limitBytes) {
    throw badRequest("Your plan's storage limit has been reached")
  }

  const id = randomUUID()
  const blobPath = blobPathFor(ctx.organisationId, id, EXTENSIONS[sniffed])
  await uploadBlob(blobPath, file.data, sniffed)

  const row = await db.attachment.create({
    data: {
      id,
      organisationId: ctx.organisationId,
      entityType: 'equipment',
      entityId: equipmentId,
      blobPath,
      fileName: file.name.slice(0, 200) || 'photo',
      mimeType: sniffed,
      sizeBytes: file.data.length,
      kind: 'photo'
    },
    select: attachmentSelect
  })
  await recordAudit(ctx, {
    action: 'equipment.photo_add',
    entityType: 'equipment',
    entityId: equipmentId,
    summary: `Added a photo to ${item.make} ${item.model}`
  })
  return row
}

export async function getAttachmentFile(
  ctx: TenantContext,
  attachmentId: string
): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const row = await tenantDb(ctx).attachment.findFirst({
    where: { id: attachmentId },
    select: { blobPath: true, mimeType: true, fileName: true }
  })
  if (!row) throw notFound('Attachment')
  return {
    data: await downloadBlob(row.blobPath),
    mimeType: row.mimeType,
    fileName: row.fileName
  }
}

export async function deleteAttachment(
  ctx: TenantContext,
  attachmentId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const db = tenantDb(ctx)
  const row = await db.attachment.findFirst({
    where: { id: attachmentId },
    select: { id: true, blobPath: true, entityId: true }
  })
  if (!row) throw notFound('Attachment')

  await deleteBlob(row.blobPath)
  await db.attachment.deleteMany({ where: { id: attachmentId } })
  await recordAudit(ctx, {
    action: 'equipment.photo_remove',
    entityType: 'equipment',
    entityId: row.entityId,
    summary: 'Removed a photo'
  })
}

// Used when the owning entity is deleted; callers have already checked
// permission and ownership.
export async function deleteAttachmentsFor(
  ctx: TenantContext,
  entityType: AttachmentEntity,
  entityId: string
): Promise<void> {
  const db = tenantDb(ctx)
  const rows = await db.attachment.findMany({
    where: { entityType, entityId },
    select: { blobPath: true }
  })
  await Promise.all(rows.map((row) => deleteBlob(row.blobPath)))
  await db.attachment.deleteMany({ where: { entityType, entityId } })
}
