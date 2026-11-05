import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { markNotificationsRead } from '@/lib/maintenance/notifications'
import { getTenantContext } from '@/lib/tenant-context'

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json(
      await markNotificationsRead(ctx, await readJson(request))
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
