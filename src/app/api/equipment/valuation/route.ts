import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { getValuationReport, valuationToCsv } from '@/lib/equipment-io'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const report = await getValuationReport(ctx)
    if (new URL(request.url).searchParams.get('format') === 'csv') {
      return new NextResponse(valuationToCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="kigumi-valuation.csv"'
        }
      })
    }
    return NextResponse.json({ report })
  } catch (error) {
    return toErrorResponse(error)
  }
}
