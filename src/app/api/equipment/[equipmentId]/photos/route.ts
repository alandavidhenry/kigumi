import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addEquipmentPhoto } from '@/lib/attachments'
import { readUploadedFile } from '@/lib/request-body'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ equipmentId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    const file = await readUploadedFile(request, 'Choose a photo to upload')
    const photo = await addEquipmentPhoto(ctx, equipmentId, file)
    return NextResponse.json({ photo }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
