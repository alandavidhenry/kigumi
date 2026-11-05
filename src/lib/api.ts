import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { isAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Maps errors thrown by src/lib into JSON responses for route handlers.
export function toErrorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    const retryAfter =
      error.code === 'RATE_LIMITED'
        ? (error.details as { retryAfterSeconds?: number } | undefined)
            ?.retryAfterSeconds
        : undefined
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      {
        status: error.status,
        headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined
      }
    )
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid input',
        code: 'BAD_REQUEST',
        details: error.issues.map(({ path, message }) => ({
          path: path.join('.'),
          message
        }))
      },
      { status: 400 }
    )
  }

  // The id goes back to the caller and into the log, so a report of "it said
  // something went wrong" can be matched to the real error.
  const errorId = randomUUID()
  logger.error('api.unhandled_error', { errorId, error })
  return NextResponse.json(
    { error: 'Something went wrong', code: 'INTERNAL', errorId },
    { status: 500 }
  )
}

// Bounded JSON parsing lives in request-body.ts; re-exported so routes keep
// importing it from here.
export { readJson } from '@/lib/request-body'
