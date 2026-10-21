import { describe, expect, it, vi } from 'vitest'

import type { AiProvider, GenerateStructuredRequest } from '@/lib/ai/provider'
import { buildScenario, runScenarioRules } from '@/lib/recommendations/eval'
import { runModelScenario } from '@/lib/recommendations/eval-model'

import {
  loadCatalogue,
  loadScenarios
} from '../../../eval/recommendations/load'

vi.mock('@/lib/prisma', () => ({ default: {} }))

// The live evaluation's plumbing, run against a stand-in model: what it sends,
// how it records retries and failures, and when it calls nothing.

const catalogue = loadCatalogue()
const scenarios = loadScenarios()

function prepare(id: string) {
  const { scenario } = scenarios.find((s) => s.scenario.id === id)!
  const built = buildScenario(scenario, catalogue)
  return { scenario, built, rules: runScenarioRules(built) }
}

// A model that replies with whatever `reply` builds from the session data.
function fakeModel(
  reply: (
    data: {
      sources: Array<{
        id: string
        rulesPick: string | null
        options: Array<{ id: string }>
        placement: { distanceMm: number[]; angleDeg: number[] }
        technique: {
          spacingMm: number[] | null
          includedAngleDeg: number[] | null
        }
      }>
    },
    attempt: number
  ) => unknown
) {
  const calls: GenerateStructuredRequest<unknown>[] = []
  const provider: AiProvider = {
    name: 'fake',
    costsMoney: false,
    async generateStructured<T>(request: GenerateStructuredRequest<T>) {
      calls.push(request as GenerateStructuredRequest<unknown>)
      const message = request.messages[0].content
      const start = message.indexOf('<session_data>') + '<session_data>'.length
      const data = JSON.parse(
        message.slice(start, message.indexOf('</session_data>'))
      )
      const output = reply(data, calls.length)
      return {
        output,
        rawText: JSON.stringify(output),
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'fake'
      }
    }
  }
  return { provider, calls }
}

const goodReply = (data: Parameters<Parameters<typeof fakeModel>[0]>[0]) => ({
  answerable: true,
  sources: data.sources.map((s) => ({
    sourceId: s.id,
    primary: {
      option: s.rulesPick ?? s.options[0].id,
      reasoning: 'Fits.',
      placement: {
        position: 'Near the source',
        distanceMm: s.placement.distanceMm[0],
        angleDeg: s.placement.angleDeg[0],
        spacingMm: s.technique.spacingMm?.[0] ?? null,
        includedAngleDeg: s.technique.includedAngleDeg?.[0] ?? null
      }
    },
    alternatives: []
  })),
  summary: null
})

describe('runModelScenario', () => {
  it('records a clean first-attempt run and checks the scenario’s model expectations', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    const { provider, calls } = fakeModel(goodReply)

    const run = await runModelScenario(provider, scenario, built, rules)

    expect(run).toMatchObject({
      attempts: 1,
      firstAttemptValid: true,
      failedClosed: false,
      problems: [],
      failures: [],
      adjustments: 0,
      inputTokens: 10,
      outputTokens: 5
    })
    expect(calls).toHaveLength(1)
  })

  it('records a retry that succeeds, with what was wrong the first time', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    const { provider } = fakeModel((data, attempt) => {
      const reply = goodReply(data)
      if (attempt === 1) reply.sources[0].primary.option = 'c99'
      return reply
    })

    const run = await runModelScenario(provider, scenario, built, rules)

    expect(run).toMatchObject({
      attempts: 2,
      firstAttemptValid: false,
      failedClosed: false,
      failures: [],
      inputTokens: 20
    })
    expect(run!.problems.join()).toMatch(/c99/)
  })

  it('records failing closed when the model never gets it right', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    const { provider } = fakeModel((data) => {
      const reply = goodReply(data)
      reply.sources[0].primary.option = 'c99'
      return reply
    })

    const run = await runModelScenario(provider, scenario, built, rules)

    expect(run).toMatchObject({
      attempts: 2,
      firstAttemptValid: false,
      failedClosed: true
    })
  })

  it('records a provider failure as a result rather than throwing', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    const provider: AiProvider = {
      name: 'broken',
      costsMoney: false,
      async generateStructured() {
        throw new Error('network down')
      }
    }
    const run = await runModelScenario(provider, scenario, built, rules)
    expect(run).toMatchObject({ failedClosed: true })
    expect(run!.problems.join()).toMatch(/AI|network/i)
  })

  it('reports a valid reply that misses the scenario’s expectations', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    // Valid, but picks the second candidate instead of the expected large-diaphragm condenser.
    const { provider } = fakeModel((data) => {
      const reply = goodReply(data)
      reply.sources[0].primary.option = data.sources[0].options[1].id
      return reply
    })
    const run = await runModelScenario(provider, scenario, built, rules)
    expect(run!.failedClosed).toBe(false)
    expect(run!.failures.join()).toMatch(/s1: pick/)
  })

  it('counts a repaired allocation clash', async () => {
    const { scenario, built, rules } = prepare('003-drum-close-mics')
    // Every source asks for its first candidate, which is the same D112.
    const { provider } = fakeModel((data) => {
      const reply = goodReply(data)
      reply.sources.forEach((entry, index) => {
        entry.primary.option = data.sources[index].options[0].id
      })
      return reply
    })
    const run = await runModelScenario(provider, scenario, built, rules)
    expect(run!.adjustments).toBeGreaterThan(1)
    expect(run!.failures.join()).toMatch(/adjustments/)
  })

  it('calls no model when the rules left nothing to rank', async () => {
    const { scenario, built, rules } = prepare('023-empty-locker')
    const { provider, calls } = fakeModel(goodReply)
    expect(await runModelScenario(provider, scenario, built, rules)).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('shows the model nothing it should not see: no ids and no unowned names', async () => {
    const { scenario, built, rules } = prepare('001-solo-vocal-mixed-locker')
    const { provider, calls } = fakeModel(goodReply)
    await runModelScenario(provider, scenario, built, rules)
    const message = calls[0].messages[0].content
    expect(message).not.toContain('neumann-u-87-ai')
    expect(message).not.toContain('SM7B')
  })
})
