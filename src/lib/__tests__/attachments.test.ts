import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addEquipmentPhoto,
  deleteAttachment,
  getAttachmentFile,
  sniffImageType
} from '@/lib/attachments'
import { MAX_PHOTOS_PER_ITEM } from '@/lib/equipment-types'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { deleteBlob, downloadBlob, uploadBlob } from '@/lib/storage'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  blobPathFor: (org: string, id: string, ext: string) => `${org}/${id}.${ext}`,
  uploadBlob: vi.fn(),
  downloadBlob: vi.fn(),
  deleteBlob: vi.fn()
}))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const photo = (overrides = {}) => ({
  name: 'front.png',
  type: 'image/png',
  data: png,
  ...overrides
})

async function code(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught)
  expect(error).toBeInstanceOf(AppError)
  return (error as AppError).code
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.equipmentItem.findFirst.mockResolvedValue({
    id: 'e1',
    make: 'A',
    model: 'B'
  })
  db.attachment.findMany.mockResolvedValue([])
  db.attachment.create.mockResolvedValue({ id: 'a1' })
})

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP and rejects everything else', () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg'
    )
    expect(sniffImageType(png)).toBe('image/png')
    expect(sniffImageType(Buffer.from('RIFF1234WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(Buffer.from('<svg></svg>'))).toBeNull()
  })
})

describe('addEquipmentPhoto', () => {
  it('stores the blob under the organisation and records it', async () => {
    await addEquipmentPhoto(owner, 'e1', photo())
    expect(uploadBlob).toHaveBeenCalledWith(
      expect.stringMatching(/^org_1\/.+\.png$/),
      png,
      'image/png'
    )
    expect(db.attachment.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      entityType: 'equipment',
      entityId: 'e1',
      kind: 'photo'
    })
  })

  it('404s for an item in another organisation', async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    expect(await code(addEquipmentPhoto(owner, 'x', photo()))).toBe('NOT_FOUND')
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it('rejects disallowed types, spoofed content, empty and oversized files', async () => {
    expect(
      await code(
        addEquipmentPhoto(owner, 'e1', photo({ type: 'image/svg+xml' }))
      )
    ).toBe('BAD_REQUEST')
    expect(
      await code(
        addEquipmentPhoto(
          owner,
          'e1',
          photo({ data: Buffer.from('not an image') })
        )
      )
    ).toBe('BAD_REQUEST')
    expect(
      await code(
        addEquipmentPhoto(owner, 'e1', photo({ data: Buffer.alloc(0) }))
      )
    ).toBe('BAD_REQUEST')
    const big = Buffer.alloc(5 * 1024 * 1024 + 1)
    png.copy(big)
    expect(
      await code(addEquipmentPhoto(owner, 'e1', photo({ data: big })))
    ).toBe('BAD_REQUEST')
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it('caps photos per item', async () => {
    db.attachment.findMany.mockResolvedValue(
      Array.from({ length: MAX_PHOTOS_PER_ITEM }, () => ({
        entityId: 'e1',
        sizeBytes: 10
      }))
    )
    expect(await code(addEquipmentPhoto(owner, 'e1', photo()))).toBe(
      'BAD_REQUEST'
    )
  })

  it('enforces the plan storage limit', async () => {
    db.attachment.findMany.mockResolvedValue([
      { entityId: 'other', sizeBytes: 250 * 1024 * 1024 }
    ])
    const free = makeContext({ planTier: PlanTier.FREE })
    expect(await code(addEquipmentPhoto(free, 'e1', photo()))).toBe(
      'BAD_REQUEST'
    )
  })

  it('forbids viewers', async () => {
    expect(await code(addEquipmentPhoto(viewer, 'e1', photo()))).toBe(
      'FORBIDDEN'
    )
  })
})

describe('getAttachmentFile', () => {
  it('lets viewers download', async () => {
    db.attachment.findFirst.mockResolvedValue({
      blobPath: 'org_1/a.png',
      mimeType: 'image/png',
      fileName: 'a.png'
    })
    vi.mocked(downloadBlob).mockResolvedValue(png)
    expect(await getAttachmentFile(viewer, 'a1')).toMatchObject({
      mimeType: 'image/png'
    })
  })

  it('404s across organisations without touching storage', async () => {
    db.attachment.findFirst.mockResolvedValue(null)
    expect(await code(getAttachmentFile(viewer, 'x'))).toBe('NOT_FOUND')
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})

describe('deleteAttachment', () => {
  it('removes the blob and the row', async () => {
    db.attachment.findFirst.mockResolvedValue({
      id: 'a1',
      blobPath: 'org_1/a.png',
      entityId: 'e1'
    })
    await deleteAttachment(owner, 'a1')
    expect(deleteBlob).toHaveBeenCalledWith('org_1/a.png')
    expect(db.attachment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1' }
    })
  })

  it('404s across organisations and forbids viewers', async () => {
    db.attachment.findFirst.mockResolvedValue(null)
    expect(await code(deleteAttachment(owner, 'x'))).toBe('NOT_FOUND')
    expect(await code(deleteAttachment(viewer, 'a1'))).toBe('FORBIDDEN')
    expect(deleteBlob).not.toHaveBeenCalled()
  })
})
