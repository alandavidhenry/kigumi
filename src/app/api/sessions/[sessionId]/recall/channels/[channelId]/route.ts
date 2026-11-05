import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { updateRecallChannel } from '@/lib/recall/service'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string; channelId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId, channelId } = await params
    await updateRecallChannel(
      ctx,
      sessionId,
      channelId,
      await readJson(request)
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
