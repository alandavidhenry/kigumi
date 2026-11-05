import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createPatTest, listPatStatus } from '@/lib/maintenance/pat'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ tests: await listPatStatus(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const test = await createPatTest(ctx, await readJson(request))
    return NextResponse.json({ test }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
