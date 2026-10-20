import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { removeUnit, updateUnit } from '@/lib/mics/locker'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ unitId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { unitId } = await params
    const unit = await updateUnit(ctx, unitId, await readJson(request))
    return NextResponse.json({ unit })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { unitId } = await params
    await removeUnit(ctx, unitId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
