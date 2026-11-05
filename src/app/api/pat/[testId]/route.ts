import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deletePatTest, updatePatTest } from '@/lib/maintenance/pat'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ testId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { testId } = await params
    await updatePatTest(ctx, testId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { testId } = await params
    await deletePatTest(ctx, testId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
