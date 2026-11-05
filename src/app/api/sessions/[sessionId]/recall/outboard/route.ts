import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createOutboard } from '@/lib/recall/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const outboard = await createOutboard(
      ctx,
      sessionId,
      await readJson(request)
    )
    return NextResponse.json({ outboard }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
