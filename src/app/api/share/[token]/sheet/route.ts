import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { renderSessionSheetPdf } from '@/lib/sessions/pdf/documents'
import { getSharedSession } from '@/lib/sessions/share'

// Public: the token is the authorisation (ADR 0016 decision 7). No session
// cookie is read.
interface RouteContext {
  params: Promise<{ token: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { token } = await params
    const pdf = await renderSessionSheetPdf(await getSharedSession(token))
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="session-sheet.pdf"',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow'
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
