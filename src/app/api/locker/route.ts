import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { addUnit, listLocker } from '@/lib/mics/locker'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ units: await listLocker(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const unit = await addUnit(ctx, await readJson(request))
    return NextResponse.json({ unit }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
