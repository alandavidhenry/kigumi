import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteRoom, updateRoom } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ roomId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { roomId } = await params
    const room = await updateRoom(ctx, roomId, await readJson(request))
    return NextResponse.json({ room })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { roomId } = await params
    await deleteRoom(ctx, roomId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
