import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deletePlan, updatePlan } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ planId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { planId } = await params
    await updatePlan(ctx, planId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { planId } = await params
    await deletePlan(ctx, planId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
