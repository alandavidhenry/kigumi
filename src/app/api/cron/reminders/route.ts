import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { assertCronAuthorised } from '@/lib/cron'
import { logger } from '@/lib/logger'
import { runReminders } from '@/lib/maintenance/reminders'

// Daily job: raise due, overdue and expiring reminders and email the digest.
// Idempotent, so a retried or doubled run does no harm.
async function handle(request: Request) {
  try {
    assertCronAuthorised(request)
    const result = await runReminders()
    logger.info('cron.reminders.finished', { ...result })
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const POST = handle
export const GET = handle
