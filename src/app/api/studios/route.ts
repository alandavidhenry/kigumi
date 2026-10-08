import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createStudio, listStudios } from '@/lib/studios'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    return NextResponse.json({ studios: await listStudios(ctx) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const studio = await createStudio(ctx, await readJson(request))
    return NextResponse.json({ studio }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
