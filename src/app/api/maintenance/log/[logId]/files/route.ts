import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { badRequest } from '@/lib/errors'
import { addLogFile } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ logId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { logId } = await params
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw badRequest('Choose a file to upload')

    const attachment = await addLogFile(ctx, logId, {
      name: file.name,
      type: file.type,
      data: Buffer.from(await file.arrayBuffer())
    })
    return NextResponse.json({ file: attachment }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
