import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addLogFile } from '@/lib/maintenance/service'
import { readUploadedFile } from '@/lib/request-body'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ logId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { logId } = await params
    const file = await readUploadedFile(request, 'Choose a file to upload')
    const attachment = await addLogFile(ctx, logId, file)
    return NextResponse.json({ file: attachment }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
