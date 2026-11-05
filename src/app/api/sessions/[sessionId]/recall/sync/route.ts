import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addMissingRecallChannels } from '@/lib/recall/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    return NextResponse.json(await addMissingRecallChannels(ctx, sessionId))
  } catch (error) {
    return toErrorResponse(error)
  }
}
