import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createPlan, listPlans } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ plans: await listPlans(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const plan = await createPlan(ctx, await readJson(request))
    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
