import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { readJson, toErrorResponse } from '@/lib/api'
import {
  AppError,
  badRequest,
  forbidden,
  isAppError,
  notFound,
  planLimit,
  unauthorized
} from '@/lib/errors'

describe('error helpers', () => {
  it('map codes to statuses', () => {
    expect(unauthorized().status).toBe(401)
    expect(forbidden().status).toBe(403)
    expect(notFound('Room').message).toBe('Room not found')
    expect(notFound().status).toBe(404)
    expect(badRequest('Nope').status).toBe(400)
    expect(new AppError('CROSS_TENANT', 'x').status).toBe(404)
    expect(new AppError('NO_ACTIVE_ORGANISATION', 'x').status).toBe(403)
  })

  it('describes plan limits', () => {
    const error = planLimit('rooms', 1)
    expect(error.status).toBe(403)
    expect(error.code).toBe('PLAN_LIMIT')
    expect(error.details).toEqual({ resource: 'rooms', limit: 1 })
  })

  it('recognises app errors', () => {
    expect(isAppError(forbidden())).toBe(true)
    expect(isAppError(new Error('x'))).toBe(false)
  })
})

describe('toErrorResponse', () => {
  it('serialises app errors', async () => {
    const response = toErrorResponse(planLimit('studios', 1))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Your plan allows 1 studios. Upgrade to add more.',
      code: 'PLAN_LIMIT',
      details: { resource: 'studios', limit: 1 }
    })
  })

  it('turns Zod errors into 400s with field paths', async () => {
    const result = z.object({ name: z.string() }).safeParse({})
    const response = toErrorResponse(result.error)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('BAD_REQUEST')
    expect(body.details[0].path).toBe('name')
  })

  it('hides unexpected errors behind a 500', async () => {
    const response = toErrorResponse(new Error('db exploded'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Something went wrong',
      code: 'INTERNAL'
    })
  })
})

describe('readJson', () => {
  it('parses JSON bodies', async () => {
    const request = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 })
    })
    expect(await readJson(request)).toEqual({ a: 1 })
  })

  it('treats malformed JSON as an empty object', async () => {
    const request = new Request('http://x', { method: 'POST', body: '{nope' })
    expect(await readJson(request)).toEqual({})
  })
})
