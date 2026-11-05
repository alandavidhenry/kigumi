import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteOutboard, updateOutboard } from '@/lib/recall/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string; outboardId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId, outboardId } = await params
    await updateOutboard(ctx, sessionId, outboardId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId, outboardId } = await params
    await deleteOutboard(ctx, sessionId, outboardId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
