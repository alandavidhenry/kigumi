import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  createSessionTemplate,
  listSessionTemplates
} from '@/lib/sessions/templates'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ templates: await listSessionTemplates(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const template = await createSessionTemplate(ctx, await readJson(request))
    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
