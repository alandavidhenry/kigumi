import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { isAppError } from '@/lib/errors'

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

  console.error('Unhandled API error', error)
  return NextResponse.json(
    { error: 'Something went wrong', code: 'INTERNAL' },
    { status: 500 }
  )
}

// Parses a JSON body, treating malformed JSON as an empty object so schema
// validation reports the problem consistently.
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
