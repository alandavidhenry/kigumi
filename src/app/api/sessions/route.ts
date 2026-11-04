import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createSession, listSessions } from '@/lib/sessions/service'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const filter = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ sessions: await listSessions(ctx, filter) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const session = await createSession(ctx, await readJson(request))
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
