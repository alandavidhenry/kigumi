import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { listAuditLog } from '@/lib/audit'
import { requirePermission, getTenantContext } from '@/lib/tenant-context'
import { Permission } from '@/types/rbac'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    requirePermission(ctx, Permission.VIEW_AUDIT_LOG)
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const entries = await listAuditLog(ctx, {
      limit: Number.isFinite(limit) ? limit : 50
    })
    return NextResponse.json({ entries })
  } catch (error) {
    return toErrorResponse(error)
  }
}
