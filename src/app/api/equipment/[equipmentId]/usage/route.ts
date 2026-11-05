import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { setUsageHours } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ equipmentId: string }>
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    const usage = await setUsageHours(ctx, equipmentId, await readJson(request))
    return NextResponse.json({ usage })
  } catch (error) {
    return toErrorResponse(error)
  }
}
