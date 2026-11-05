import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { deleteLogEntry } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ logId: string }>
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { logId } = await params
    await deleteLogEntry(ctx, logId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
