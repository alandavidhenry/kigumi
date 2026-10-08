import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { importEquipmentCsv } from '@/lib/equipment-io'
import { badRequest } from '@/lib/errors'
import { getTenantContext } from '@/lib/tenant-context'

const MAX_CSV_BYTES = 2 * 1024 * 1024

// Body is the raw CSV text (content-type text/csv).
export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const text = await request.text()
    if (text.length > MAX_CSV_BYTES) throw badRequest('That CSV is too large')
    return NextResponse.json(await importEquipmentCsv(ctx, text), {
      status: 201
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
