import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createConsole, listConsoles } from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ consoles: await listConsoles(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const created = await createConsole(ctx, await readJson(request))
    return NextResponse.json({ console: created }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
