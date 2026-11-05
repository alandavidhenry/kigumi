import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { deleteConsole, updateConsole } from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ consoleId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { consoleId } = await params
    await updateConsole(ctx, consoleId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { consoleId } = await params
    await deleteConsole(ctx, consoleId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
