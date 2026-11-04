import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createChannel } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const channel = await createChannel(ctx, sessionId, await readJson(request))
    return NextResponse.json({ channel }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
