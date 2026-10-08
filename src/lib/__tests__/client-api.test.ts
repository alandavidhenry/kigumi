import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '@/lib/client-api'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function respond(status: number, body?: unknown) {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  )
}

describe('apiFetch', () => {
  it('GETs and returns JSON', async () => {
    respond(200, { studios: [] })
    expect(await apiFetch('/api/studios')).toEqual({ studios: [] })
    expect(fetchMock).toHaveBeenCalledWith('/api/studios', {
      method: 'GET',
      headers: undefined,
      body: undefined
    })
  })

  it('sends JSON bodies', async () => {
    respond(201, { studio: { id: 's1' } })
    await apiFetch('/api/studios', { method: 'POST', body: { name: 'A' } })
    expect(fetchMock).toHaveBeenCalledWith('/api/studios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"A"}'
    })
  })

  it('returns undefined for 204', async () => {
    respond(204)
    expect(
      await apiFetch('/api/rooms/r1', { method: 'DELETE' })
    ).toBeUndefined()
  })

  it('throws ApiError with the server message', async () => {
    respond(403, {
      error: 'Upgrade',
      code: 'PLAN_LIMIT',
      details: { limit: 1 }
    })
    const error = await apiFetch('/api/studios').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      message: 'Upgrade',
      status: 403,
      code: 'PLAN_LIMIT',
      details: { limit: 1 }
    })
  })

  it('falls back to a generic message for non-JSON errors', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
    await expect(apiFetch('/api/studios')).rejects.toMatchObject({
      message: 'Something went wrong',
      status: 502
    })
  })
})
