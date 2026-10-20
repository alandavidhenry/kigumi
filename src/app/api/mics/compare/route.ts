import { NextResponse } from 'next/server'
import { z } from 'zod'

import { readJson, toErrorResponse } from '@/lib/api'
import { generateMicComparison, getMicComparison } from '@/lib/mics/ai'
import { MAX_COMPARE, MIN_COMPARE } from '@/lib/mics/compare'
import { getTenantContext } from '@/lib/tenant-context'

const bodySchema = z.object({
  mics: z.array(z.string().min(1)).min(MIN_COMPARE).max(MAX_COMPARE)
})

// ?mics=slug-a,slug-b: the cached AI comparison for these mics, or null.
export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext()
    const refs = (new URL(request.url).searchParams.get('mics') ?? '').split(
      ','
    )
    const { comparison } = await getMicComparison(ctx, refs)
    return NextResponse.json({ comparison })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// { mics: [slug, ...] }: generates the comparison if it is not cached.
export async function POST(request: Request) {
  try {
    const ctx = await getTenantContext()
    const { mics } = bodySchema.parse(await readJson(request))
    const { comparison } = await generateMicComparison(ctx, mics)
    return NextResponse.json({ comparison })
  } catch (error) {
    return toErrorResponse(error)
  }
}
