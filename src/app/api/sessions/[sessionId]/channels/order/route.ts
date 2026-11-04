import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { orderChannels } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await orderChannels(ctx, sessionId, await readJson(request))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
