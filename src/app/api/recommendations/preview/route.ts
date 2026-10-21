import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { previewRecommendation } from '@/lib/recommendations/service'
import { getTenantContext } from '@/lib/tenant-context'

// The rules-based recommendation: free, instant, nothing stored.
export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const preview = await previewRecommendation(ctx, await readJson(request))
    return NextResponse.json({ preview })
  } catch (error) {
    return toErrorResponse(error)
  }
}
