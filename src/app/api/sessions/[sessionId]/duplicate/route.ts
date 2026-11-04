import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { duplicateSession } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const session = await duplicateSession(ctx, sessionId)
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
