import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  createRecommendation,
  listRecommendations
} from '@/lib/recommendations/service'
import { getTenantContext } from '@/lib/tenant-context'

// Past recommendations, newest first.
export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const limit = Number(new URL(request.url).searchParams.get('limit'))
    return NextResponse.json({
      recommendations: await listRecommendations(
        ctx,
        Number.isFinite(limit) && limit > 0 ? limit : undefined
      )
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// The same body as /preview, plus an optional `regenerate: true`. Ranks the
// rules' candidates with the model and stores the result. 200 with
// `recommendation: null` when there was nothing to rank (nothing is spent).
export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const body = await readJson(request)
    const regenerate =
      typeof body === 'object' &&
      body !== null &&
      (body as { regenerate?: unknown }).regenerate === true
    const result = await createRecommendation(ctx, body, { regenerate })
    return NextResponse.json(result, {
      status: result.recommendation && !result.cached ? 201 : 200
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
