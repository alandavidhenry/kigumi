import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createMic, listMicsForReview } from '@/lib/mics/admin'
import { getPlatformAdminContext } from '@/lib/platform-admin'
import { MAX_ADMIN_JSON_BYTES } from '@/lib/request-body'

export async function GET(request: Request) {
  try {
    const admin = await getPlatformAdminContext()
    const params = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ mics: await listMicsForReview(admin, params) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getPlatformAdminContext()
    const mic = await createMic(
      admin,
      await readJson(request, MAX_ADMIN_JSON_BYTES)
    )
    return NextResponse.json({ mic }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
