import { NextResponse } from 'next/server'

import { readJson, toErrorResponse } from '@/lib/api'
import { createSessionFromWizard } from '@/lib/sessions/wizard'
import { getTenantContext } from '@/lib/tenant-context'

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const result = await createSessionFromWizard(ctx, await readJson(request))
    return NextResponse.json({ result }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
