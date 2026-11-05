import { describe, expect, it, vi } from 'vitest'

import { formatLogLine, logger, serialiseError } from '@/lib/logger'
import { telemetryOptions } from '@/lib/telemetry'

vi.mock('@azure/monitor-opentelemetry', () => ({ useAzureMonitor: vi.fn() }))

describe('formatLogLine', () => {
  it('writes one JSON object with time, level and event first', () => {
    const line = formatLogLine(
      'info',
      'cron.reminders.finished',
      { created: 3 },
      new Date('2026-11-05T07:00:00Z')
    )
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      time: '2026-11-05T07:00:00.000Z',
      level: 'info',
      event: 'cron.reminders.finished',
      created: 3
    })
  })

  it('serialises errors instead of printing {}', () => {
    const error = Object.assign(new Error('boom'), { code: 'P2002' })
    const parsed = JSON.parse(formatLogLine('error', 'x', { error }))
    expect(parsed.error).toMatchObject({
      name: 'Error',
      message: 'boom',
      code: 'P2002'
    })
    expect(parsed.error.stack.split('\n').length).toBeLessThanOrEqual(8)
  })
})

describe('serialiseError', () => {
  it('handles thrown non-errors', () => {
    expect(serialiseError('plain')).toEqual({
      name: 'NonError',
      message: 'plain'
    })
  })
})

describe('logger', () => {
  it('sends errors to stderr, warnings to warn and info to stdout', () => {
    const error = vi.mocked(console.error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    error.mockClear()

    logger.error('a.b', { error: new Error('x') })
    logger.warn('c.d')
    logger.info('e.f', { n: 1 })

    expect(JSON.parse(String(error.mock.calls[0][0])).event).toBe('a.b')
    expect(JSON.parse(String(warn.mock.calls[0][0])).event).toBe('c.d')
    expect(JSON.parse(String(out.mock.calls[0][0])).event).toBe('e.f')
    warn.mockRestore()
    out.mockRestore()
  })
})

describe('telemetryOptions', () => {
  it('traces everything by default and turns on the Postgres instrumentation', () => {
    const options = telemetryOptions({})
    expect(options.samplingRatio).toBe(1)
    expect(options.instrumentationOptions.postgreSql.enabled).toBe(true)
  })

  it('takes a sampling ratio between 0 and 1 and ignores junk', () => {
    expect(
      telemetryOptions({ OTEL_TRACES_SAMPLER_RATIO: '0.25' }).samplingRatio
    ).toBe(0.25)
    expect(
      telemetryOptions({ OTEL_TRACES_SAMPLER_RATIO: 'lots' }).samplingRatio
    ).toBe(1)
    expect(
      telemetryOptions({ OTEL_TRACES_SAMPLER_RATIO: '7' }).samplingRatio
    ).toBe(1)
  })
})
