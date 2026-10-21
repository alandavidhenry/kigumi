import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { getRecommendation } from '@/lib/recommendations/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ recommendationId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { recommendationId } = await params
    return NextResponse.json({
      recommendation: await getRecommendation(ctx, recommendationId)
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
