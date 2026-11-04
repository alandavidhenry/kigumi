import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { renderSessionSheetPdf } from '@/lib/sessions/pdf/documents'
import { getSessionSheet } from '@/lib/sessions/sheet'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const pdf = await renderSessionSheetPdf(
      await getSessionSheet(ctx, sessionId)
    )
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="session-sheet.pdf"',
        'cache-control': 'private, no-store'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
