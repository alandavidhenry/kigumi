import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createLogEntry, listLog } from '@/lib/maintenance/service'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ log: await listLog(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const entry = await createLogEntry(ctx, await readJson(request))
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
