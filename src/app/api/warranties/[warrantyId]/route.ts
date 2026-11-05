import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteWarranty, updateWarranty } from '@/lib/maintenance/warranty'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ warrantyId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { warrantyId } = await params
    await updateWarranty(ctx, warrantyId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { warrantyId } = await params
    await deleteWarranty(ctx, warrantyId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
