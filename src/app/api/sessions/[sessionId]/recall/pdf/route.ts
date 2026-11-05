import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { renderRecallPdf } from '@/lib/recall/pdf'
import { getRecallPrintView } from '@/lib/recall/sheet'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const pdf = await renderRecallPdf(await getRecallPrintView(ctx, sessionId))
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="recall-sheet.pdf"',
        'cache-control': 'private, no-store'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
