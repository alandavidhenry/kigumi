import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { listAuditLog } from '@/lib/audit'
import { getTenantContext } from '@/lib/tenant-context'

// listAuditLog enforces the permission (owner/manager) and plan feature
// (Studio+) itself.
export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const entries = await listAuditLog(ctx, {
      limit: Number.isFinite(limit) ? limit : 50
    })
    return NextResponse.json({ entries })
  } catch (error) {
    return toErrorResponse(error)
  }
}
