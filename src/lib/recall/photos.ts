import { storePhoto } from '@/lib/attachments'
import type { AttachmentRow } from '@/lib/attachments'
import { recordAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { requireRecallSheet } from './service'
import { MAX_RECALL_PHOTOS } from './types'

// Desk photos on a recall sheet (PLAN §4.7). They are ordinary attachments
// owned by the sheet, served through /api/attachments/[id] like any photo.
export async function addRecallPhoto(
  ctx: TenantContext,
  sessionId: string,
  file: { name: string; type: string; data: Buffer }
): Promise<AttachmentRow> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const sheet = await requireRecallSheet(tenantDb(ctx), sessionId)
  const row = await storePhoto(
    ctx,
    {
      entityType: 'recall_sheet',
      entityId: sheet.id,
      maxPhotos: MAX_RECALL_PHOTOS
    },
    file
  )
  await recordAudit(ctx, {
    action: 'recall.photo_add',
    entityType: 'recall_sheet',
    entityId: sheet.id,
    summary: 'Added a desk photo to the recall sheet'
  })
  return row
}
