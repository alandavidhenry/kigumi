import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createWarranty, listWarranties } from '@/lib/maintenance/warranty'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ warranties: await listWarranties(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const warranty = await createWarranty(ctx, await readJson(request))
    return NextResponse.json({ warranty }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
