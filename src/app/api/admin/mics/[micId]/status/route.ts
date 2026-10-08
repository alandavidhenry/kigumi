import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { changeMicStatus } from '@/lib/mics/admin'
import { getPlatformAdminContext } from '@/lib/platform-admin'

interface RouteContext {
  params: Promise<{ micId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const admin = await getPlatformAdminContext()
    const { micId } = await params
    const mic = await changeMicStatus(admin, micId, await readJson(request))
    return NextResponse.json({ mic })
  } catch (error) {
    return toErrorResponse(error)
  }
}
