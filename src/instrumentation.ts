import type { Instrumentation } from 'next'

// Observability (Phase 8, M4; see docs/operations.md).
//
// register(): when APPLICATIONINSIGHTS_CONNECTION_STRING is set, start the
// Azure Monitor OpenTelemetry distro. It records every request, its Postgres
// and Blob/HTTP dependencies with timings, and exceptions (src/lib/logger.ts
// attaches logged errors to the active request). Without the variable
// (local development, tests, CI) nothing is loaded.
//
// onRequestError(): errors Next catches itself (a server component failing to
// render, say) are logged as structured events. Route handlers already log
// their own unhandled errors through toErrorResponse.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return
  const { startTelemetry } = await import('@/lib/telemetry')
  startTelemetry()
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const { logger } = await import('@/lib/logger')
  logger.error('request.error', {
    method: request.method,
    // The path without its query string, which can carry tokens.
    path: request.path.split('?')[0],
    routePath: context.routePath,
    routeType: context.routeType,
    digest:
      typeof error === 'object' && error !== null && 'digest' in error
        ? String((error as { digest: unknown }).digest)
        : undefined,
    error
  })
}
