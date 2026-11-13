import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readJson, toErrorResponse } from '@/lib/api'
import { resolveSetup } from '@/lib/setup'
import { getTenantContext } from '@/lib/tenant-context'

const bodySchema = z.object({ outcome: z.enum(['finished', 'skipped']) })

export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const { outcome } = bodySchema.parse(await readJson(request))
    await resolveSetup(ctx, outcome)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
