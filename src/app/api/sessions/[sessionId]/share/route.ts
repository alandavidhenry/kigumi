import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createShareLink, revokeShareLink } from '@/lib/sessions/share'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const share = await createShareLink(ctx, sessionId, await readJson(request))
    return NextResponse.json({ share }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await revokeShareLink(ctx, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
