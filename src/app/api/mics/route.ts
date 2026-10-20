import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { listMics } from '@/lib/mics/catalogue'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const params = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json({ mics: await listMics(ctx, params) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
