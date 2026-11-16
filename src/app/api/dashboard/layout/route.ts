import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  getDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout
} from '@/lib/dashboard/preferences'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ layout: await getDashboardLayout(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getTenantContext()
    const layout = await saveDashboardLayout(ctx, await readJson(request))
    return NextResponse.json({ layout })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE() {
  try {
    const ctx = await getTenantContext()
    await resetDashboardLayout(ctx)
    return NextResponse.json({ layout: null })
  } catch (error) {
    return toErrorResponse(error)
  }
}
