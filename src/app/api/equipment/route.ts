import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createEquipment, listEquipmentPage } from '@/lib/equipment'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const { page, ...filter } = Object.fromEntries(
      new URL(request.url).searchParams
    )
    const result = await listEquipmentPage(ctx, filter, page)
    return NextResponse.json({
      equipment: result.items,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount
    })
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
