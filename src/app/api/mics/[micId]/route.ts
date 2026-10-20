import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { getMic } from '@/lib/mics/catalogue'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ micId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { micId } = await params
    return NextResponse.json({ mic: await getMic(ctx, micId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
