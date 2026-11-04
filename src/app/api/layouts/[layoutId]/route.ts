import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { getLayout, saveLayout } from '@/lib/layout/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ layoutId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { layoutId } = await params
    return NextResponse.json({ layout: await getLayout(ctx, layoutId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { layoutId } = await params
    return NextResponse.json(
      await saveLayout(ctx, layoutId, await readJson(request))
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
