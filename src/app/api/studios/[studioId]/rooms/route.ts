import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createRoom } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ studioId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { studioId } = await params
    const room = await createRoom(ctx, studioId, await readJson(request))
    return NextResponse.json({ room }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
