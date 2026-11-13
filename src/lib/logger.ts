import { trace } from '@opentelemetry/api'

// Structured logging (Phase 8, M4). One JSON object per line with a stable
// `event` name, so App Service log streams and Azure Monitor can filter and
// alert on events ("ai.daily_cap_reached", "api.unhandled_error") instead of
// matching free text. Errors are also recorded on the active OpenTelemetry
// span, so they show up against the request in Application Insights when
// telemetry is configured (src/instrumentation.ts).
//
// Never log tenant content: ids, counts and error messages only.

export type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

export interface SerialisedError {
  name: string
  message: string
  code?: unknown
  stack?: string
}

export function serialiseError(error: unknown): SerialisedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...('code' in error && { code: (error as { code: unknown }).code }),
      ...(error.stack && {
        stack: error.stack.split('\n').slice(0, 8).join('\n')
      })
    }
  }
  return { name: 'NonError', message: String(error) }
}

export function formatLogLine(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
  now: Date = new Date()
): string {
  const { error, ...rest } = fields
  return JSON.stringify({
    time: now.toISOString(),
    level,
    event,
    ...rest,
    ...(error !== undefined && { error: serialiseError(error) })
  })
}

function write(level: LogLevel, event: string, fields?: LogFields) {
  const line = formatLogLine(level, event, fields)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  // console.info (stdout in Node) rather than process.stdout, which Next's
  // Edge-runtime analysis flags because instrumentation.ts imports this file.
  // eslint-disable-next-line no-console
  else console.info(line)

  if (level === 'error' && fields?.error !== undefined) {
    const span = trace.getActiveSpan()
    const error = fields.error
    span?.recordException(
      error instanceof Error ? error : new Error(String(error))
    )
  }
}

export const logger = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields)
}
