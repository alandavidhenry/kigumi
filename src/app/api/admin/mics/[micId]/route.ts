import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { getMicForAdmin, updateMic } from '@/lib/mics/admin'
import { getPlatformAdminContext } from '@/lib/platform-admin'

interface RouteContext {
  params: Promise<{ micId: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const admin = await getPlatformAdminContext()
    const { micId } = await params
    return NextResponse.json({ mic: await getMicForAdmin(admin, micId) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const admin = await getPlatformAdminContext()
    const { micId } = await params
    const mic = await updateMic(admin, micId, await readJson(request))
    return NextResponse.json({ mic })
  } catch (error) {
    return toErrorResponse(error)
  }
}
