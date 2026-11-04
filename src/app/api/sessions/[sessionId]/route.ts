import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  deleteSession,
  getSession,
  updateSession
} from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    return NextResponse.json({ session: await getSession(ctx, sessionId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await updateSession(ctx, sessionId, await readJson(request))
    return NextResponse.json({ session: await getSession(ctx, sessionId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await deleteSession(ctx, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
