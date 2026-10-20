import { NextResponse } from 'next/server'

import { getAiUsage } from '@/lib/ai/usage'
import { toErrorResponse } from '@/lib/api'
import { getTenantContext } from '@/lib/tenant-context'

// This month's AI requests against the plan allowance.
export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ usage: await getAiUsage(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
