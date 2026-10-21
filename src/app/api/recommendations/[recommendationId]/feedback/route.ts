import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { submitFeedback } from '@/lib/recommendations/feedback'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ recommendationId: string }>
}

// Your verdict on one source (or '*' for the whole recommendation). Sending it
// again replaces your earlier one.
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { recommendationId } = await params
    const feedback = await submitFeedback(
      ctx,
      recommendationId,
      await readJson(request)
    )
    return NextResponse.json({ feedback })
  } catch (error) {
    return toErrorResponse(error)
  }
}
