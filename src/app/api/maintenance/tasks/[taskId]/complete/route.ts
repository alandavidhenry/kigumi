import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { completeTask } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ taskId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { taskId } = await params
    const log = await completeTask(ctx, taskId, await readJson(request))
    return NextResponse.json({ log }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
