import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { deleteAttachment, getAttachmentFile } from '@/lib/attachments'
import { uploadedFileHeaders } from '@/lib/http'
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
      headers: uploadedFileHeaders(file.mimeType, file.fileName)
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
