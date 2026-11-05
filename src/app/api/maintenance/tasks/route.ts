import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { listTasks } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ tasks: await listTasks(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
