import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { renderLayoutPdf } from '@/lib/sessions/pdf/documents'
import { getLayoutSheet } from '@/lib/sessions/sheet'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ layoutId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { layoutId } = await params
    const pdf = await renderLayoutPdf(await getLayoutSheet(ctx, layoutId))
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="layout.pdf"',
        'cache-control': 'private, no-store'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
