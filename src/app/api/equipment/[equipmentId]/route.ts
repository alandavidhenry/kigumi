import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteEquipment, getEquipment, updateEquipment } from '@/lib/equipment'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ equipmentId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    return NextResponse.json({ item: await getEquipment(ctx, equipmentId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    const item = await updateEquipment(
      ctx,
      equipmentId,
      await readJson(request)
    )
    return NextResponse.json({ item })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { equipmentId } = await params
    await deleteEquipment(ctx, equipmentId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
