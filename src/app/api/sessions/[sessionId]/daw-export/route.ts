import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { badRequest } from '@/lib/errors'
import { getDawExport } from '@/lib/sessions/sheet'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { sessionId } = await params
    const format = new URL(request.url).searchParams.get('format') ?? 'csv'
    if (format !== 'csv' && format !== 'txt') {
      throw badRequest('Use format=csv or format=txt')
    }
    const file = await getDawExport(ctx, sessionId, format)
    return new NextResponse(file.body, {
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${file.fileName}"`
      }
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
