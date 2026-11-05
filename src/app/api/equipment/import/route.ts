import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { importEquipmentCsv } from '@/lib/equipment-io'
import { MAX_CSV_BYTES, readText } from '@/lib/request-body'
import { getTenantContext } from '@/lib/tenant-context'

// Body is the raw CSV text (content-type text/csv).
export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const text = await readText(request, MAX_CSV_BYTES)
    return NextResponse.json(await importEquipmentCsv(ctx, text), {
      status: 201
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
