import { afterEach, describe, expect, it, vi } from 'vitest'

import { onRequestError, register } from '@/instrumentation'
import { startTelemetry } from '@/lib/telemetry'

vi.mock('@/lib/telemetry', () => ({ startTelemetry: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('register', () => {
  it('starts telemetry only on Node with a connection string', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('APPLICATIONINSIGHTS_CONNECTION_STRING', '')
    await register()
    expect(startTelemetry).not.toHaveBeenCalled()

    vi.stubEnv('APPLICATIONINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=x')
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(startTelemetry).not.toHaveBeenCalled()

    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()
    expect(startTelemetry).toHaveBeenCalledTimes(1)
  })
})

describe('onRequestError', () => {
  it('logs a structured event without the query string', async () => {
    const logged = vi.mocked(console.error)
    logged.mockClear()
    await onRequestError(
      Object.assign(new Error('render failed'), { digest: 'abc123' }),
      {
        path: '/share/secret-token?x=1',
        method: 'GET',
        headers: {}
      },
      {
        routerKind: 'App Router',
        routePath: '/share/[token]',
        routeType: 'render',
        renderSource: 'server-rendering',
        revalidateReason: undefined
      }
    )
    const line = JSON.parse(String(logged.mock.calls[0][0]))
    expect(line).toMatchObject({
      event: 'request.error',
      path: '/share/secret-token',
      routePath: '/share/[token]',
      digest: 'abc123',
      error: { message: 'render failed' }
    })
  })
})
