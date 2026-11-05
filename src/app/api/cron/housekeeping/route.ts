import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { assertCronAuthorised } from '@/lib/cron'
import { runHousekeeping } from '@/lib/housekeeping'
import { logger } from '@/lib/logger'

// Daily job: prune old rate-limit rows and delete orphaned blobs. Safe to run
// twice; called by .github/workflows/cron-housekeeping.yml.
async function handle(request: Request) {
  try {
    assertCronAuthorised(request)
    const result = await runHousekeeping()
    logger.info('cron.housekeeping.finished', { ...result })
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const POST = handle
export const GET = handle
