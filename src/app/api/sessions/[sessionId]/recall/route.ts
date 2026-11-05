import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  createRecallSheet,
  deleteRecallSheet,
  getRecallSheet,
  updateRecallSheet
} from '@/lib/recall/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    return NextResponse.json({ recall: await getRecallSheet(ctx, sessionId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const recall = await createRecallSheet(
      ctx,
      sessionId,
      await readJson(request)
    )
    return NextResponse.json({ recall }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await updateRecallSheet(ctx, sessionId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    await deleteRecallSheet(ctx, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
