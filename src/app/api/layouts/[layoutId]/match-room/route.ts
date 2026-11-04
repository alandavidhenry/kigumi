import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { matchRoomSize } from '@/lib/layout/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ layoutId: string }>
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { layoutId } = await params
    return NextResponse.json({ layout: await matchRoomSize(ctx, layoutId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
