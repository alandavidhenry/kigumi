import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { deleteAttachment, getAttachmentFile } from '@/lib/attachments'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ attachmentId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { attachmentId } = await params
    const file = await getAttachmentFile(ctx, attachmentId)
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'content-type': file.mimeType,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=3600'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { attachmentId } = await params
    await deleteAttachment(ctx, attachmentId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
