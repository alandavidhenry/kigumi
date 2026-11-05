import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  deleteConsoleTemplate,
  getConsoleTemplate,
  updateConsoleTemplate
} from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ templateId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { templateId } = await params
    return NextResponse.json({
      template: await getConsoleTemplate(ctx, templateId)
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { templateId } = await params
    await updateConsoleTemplate(ctx, templateId, await readJson(request))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { templateId } = await params
    await deleteConsoleTemplate(ctx, templateId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
