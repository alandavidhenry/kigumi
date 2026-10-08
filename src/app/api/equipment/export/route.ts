import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { exportEquipmentCsv } from '@/lib/equipment-io'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const params = Object.fromEntries(new URL(request.url).searchParams)
    const csv = await exportEquipmentCsv(ctx, params)
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="kigumi-equipment.csv"'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
