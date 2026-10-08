import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteStudio, getStudio, updateStudio } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ studioId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { studioId } = await params
    return NextResponse.json({ studio: await getStudio(ctx, studioId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { studioId } = await params
    const studio = await updateStudio(ctx, studioId, await readJson(request))
    return NextResponse.json({ studio })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { studioId } = await params
    await deleteStudio(ctx, studioId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
