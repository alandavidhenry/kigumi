import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  deleteSessionTemplate,
  renameSessionTemplate
} from '@/lib/sessions/templates'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ templateId: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { templateId } = await params
    await renameSessionTemplate(ctx, templateId, await readJson(request))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { templateId } = await params
    await deleteSessionTemplate(ctx, templateId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
