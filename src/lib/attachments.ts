import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import {
  MAX_PHOTOS_PER_ITEM,
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES
} from '@/lib/equipment-types'
import { badRequest, forbidden, notFound } from '@/lib/errors'
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
import { Permission, hasPermission } from '@/types/rbac'

export type AttachmentEntity =
  'equipment' | 'recall_sheet' | 'warranty' | 'maintenance_log'

// Who may read and change an owner's attachments. Equipment photos, warranty
// receipts and service documents follow the inventory permissions; desk photos
// follow the session permissions.
const VIEW_BY_ENTITY: Record<AttachmentEntity, Permission> = {
  equipment: Permission.VIEW_INVENTORY,
  recall_sheet: Permission.VIEW_SESSIONS,
  warranty: Permission.VIEW_INVENTORY,
  maintenance_log: Permission.VIEW_INVENTORY
}
const MANAGE_BY_ENTITY: Record<AttachmentEntity, Permission> = {
  equipment: Permission.MANAGE_INVENTORY,
  recall_sheet: Permission.MANAGE_SESSIONS,
  warranty: Permission.MANAGE_INVENTORY,
  maintenance_log: Permission.MANAGE_INVENTORY
}

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

// Fails before any lookup when the role could not reach any owner type, so a
// caller without access never learns whether an id exists.
function requireAnyOf(ctx: TenantContext, permissions: Permission[]) {
  if (!permissions.some((p) => hasPermission(ctx.role, p))) throw forbidden()
}

// Unknown owner types are treated as equipment.
function entityOf(value: string): AttachmentEntity {
  return value === 'recall_sheet' ||
    value === 'warranty' ||
    value === 'maintenance_log'
    ? value
    : 'equipment'
}

const REMOVE_AUDIT: Record<
  AttachmentEntity,
  { action: string; summary: string }
> = {
  equipment: { action: 'equipment.photo_remove', summary: 'Removed a photo' },
  recall_sheet: { action: 'recall.photo_remove', summary: 'Removed a photo' },
  warranty: { action: 'warranty.file_remove', summary: 'Removed a file' },
  maintenance_log: {
    action: 'maintenance.file_remove',
    summary: 'Removed a file'
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
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

// Receipts and service documents may also be PDFs.
export function sniffFileType(data: Uint8Array): string | null {
  const image = sniffImageType(data)
  if (image) return image
  const header = String.fromCharCode(...data.slice(0, 5))
  return header === '%PDF-' ? 'application/pdf' : null
}

export async function listAttachments(
  ctx: TenantContext,
  entityType: AttachmentEntity,
  entityId: string
): Promise<AttachmentRow[]> {
  requirePermission(ctx, VIEW_BY_ENTITY[entityType])
  return tenantDb(ctx).attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
    select: attachmentSelect
  })
}

// Validates and stores one image for an owner the caller has already checked.
// Shared by equipment photos and desk photos so both get the same magic-byte
// check, size cap, per-owner cap and storage-plan limit.
export async function storePhoto(
  ctx: TenantContext,
  owner: {
    entityType: AttachmentEntity
    entityId: string
    maxPhotos: number
    // Receipts and service documents: also accept PDFs, with their own size
    // cap and attachment kind.
    document?: { kind: string; maxBytes: number }
  },
  file: { name: string; type: string; data: Buffer }
): Promise<AttachmentRow> {
  const db = tenantDb(ctx)
  const document = owner.document
  const allowed: readonly string[] = document
    ? [...PHOTO_MIME_TYPES, 'application/pdf']
    : PHOTO_MIME_TYPES
  if (!allowed.includes(file.type)) {
    throw badRequest(
      document
        ? 'Files must be JPEG, PNG, WebP or PDF'
        : 'Photos must be JPEG, PNG or WebP'
    )
  }
  const maxBytes = document?.maxBytes ?? MAX_PHOTO_BYTES
  if (file.data.length === 0 || file.data.length > maxBytes) {
    throw badRequest(`Files must be under ${maxBytes / (1024 * 1024)} MB`)
  }
  const sniffed = document
    ? sniffFileType(file.data)
    : sniffImageType(file.data)
  if (sniffed !== file.type) {
    throw badRequest('That file is not a valid image or PDF')
  }

  const existing = await db.attachment.findMany({
    select: { entityId: true, sizeBytes: true }
  })
  if (
    existing.filter((row) => row.entityId === owner.entityId).length >=
    owner.maxPhotos
  ) {
    throw badRequest(`At most ${owner.maxPhotos} files here`)
  }
  const usedBytes = existing.reduce((sum, row) => sum + row.sizeBytes, 0)
  const limitBytes = getPlanLimits(ctx.planTier).storageMb * 1024 * 1024
  if (usedBytes + file.data.length > limitBytes) {
    throw badRequest("Your plan's storage limit has been reached")
  }

  const id = randomUUID()
  const blobPath = blobPathFor(ctx.organisationId, id, EXTENSIONS[sniffed])
  await uploadBlob(blobPath, file.data, sniffed)

  return db.attachment.create({
    data: {
      id,
      organisationId: ctx.organisationId,
      entityType: owner.entityType,
      entityId: owner.entityId,
      blobPath,
      fileName: file.name.slice(0, 200) || 'photo',
      mimeType: sniffed,
      sizeBytes: file.data.length,
      kind: document?.kind ?? 'photo'
    },
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

  const row = await storePhoto(
    ctx,
    {
      entityType: 'equipment',
      entityId: equipmentId,
      maxPhotos: MAX_PHOTOS_PER_ITEM
    },
    file
  )
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
  requireAnyOf(ctx, Object.values(VIEW_BY_ENTITY))
  const row = await tenantDb(ctx).attachment.findFirst({
    where: { id: attachmentId },
    select: { blobPath: true, mimeType: true, fileName: true, entityType: true }
  })
  if (!row) throw notFound('Attachment')
  requirePermission(ctx, VIEW_BY_ENTITY[entityOf(row.entityType)])
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
  requireAnyOf(ctx, Object.values(MANAGE_BY_ENTITY))
  const db = tenantDb(ctx)
  const row = await db.attachment.findFirst({
    where: { id: attachmentId },
    select: { id: true, blobPath: true, entityId: true, entityType: true }
  })
  if (!row) throw notFound('Attachment')
  const entityType = entityOf(row.entityType)
  requirePermission(ctx, MANAGE_BY_ENTITY[entityType])

  await deleteBlob(row.blobPath)
  await db.attachment.deleteMany({ where: { id: attachmentId } })
  await recordAudit(ctx, {
    action: REMOVE_AUDIT[entityType].action,
    entityType,
    entityId: row.entityId,
    summary: REMOVE_AUDIT[entityType].summary
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
