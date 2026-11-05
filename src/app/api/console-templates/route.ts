import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  createConsoleTemplate,
  listBuiltInTemplates,
  listConsoleTemplates
} from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({
      templates: await listConsoleTemplates(ctx),
      builtIn: listBuiltInTemplates()
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const template = await createConsoleTemplate(ctx, await readJson(request))
    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
