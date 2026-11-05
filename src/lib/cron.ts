import { timingSafeEqual } from 'node:crypto'

import { AppError, unauthorized } from '@/lib/errors'

// Cron routes are called by a scheduled workflow with
// `Authorization: Bearer $CRON_SECRET` (ADR 0009). No session is involved.
// An unset secret refuses everything rather than leaving the job open.
export function assertCronAuthorised(request: Request): void {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new AppError('UNAUTHORIZED', 'Cron is not configured')

  const header = request.headers.get('authorization') ?? ''
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const expected = Buffer.from(secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw unauthorized()
  }
}
