import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addRecallPhoto } from '@/lib/recall/photos'
import { readUploadedFile } from '@/lib/request-body'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const file = await readUploadedFile(request, 'Choose a photo to upload')
    const photo = await addRecallPhoto(ctx, sessionId, file)
    return NextResponse.json({ photo }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
