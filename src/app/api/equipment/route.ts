import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createEquipment, listEquipment } from '@/lib/equipment'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const params = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ equipment: await listEquipment(ctx, params) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const item = await createEquipment(ctx, await readJson(request))
    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
