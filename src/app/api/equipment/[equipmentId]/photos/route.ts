import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addEquipmentPhoto } from '@/lib/attachments'
import { badRequest } from '@/lib/errors'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ equipmentId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw badRequest('Choose a photo to upload')

    const photo = await addEquipmentPhoto(ctx, equipmentId, {
      name: file.name,
      type: file.type,
      data: Buffer.from(await file.arrayBuffer())
    })
    return NextResponse.json({ photo }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
