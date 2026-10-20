import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { generateMicSummary, getMicSummary } from '@/lib/mics/ai'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ micId: string }>
}

// The cached AI summary for the mic's current specs, or null. Free.
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { micId } = await params
    const { summary } = await getMicSummary(ctx, micId)
    return NextResponse.json({ summary })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// Generates the summary if it is not cached. Spends AI allowance only when it
// has to call the model.
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { micId } = await params
    const { summary } = await generateMicSummary(ctx, micId)
    return NextResponse.json({ summary })
  } catch (error) {
    return toErrorResponse(error)
  }
}
